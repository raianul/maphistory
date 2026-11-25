/**
 * Saved stories in Supabase. Server-side only: uses the secret key, which
 * bypasses the database's access rules, so it must never reach the browser.
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AiPlace } from "./ai/types";
import type { StoryTarget } from "./ai/place-story";
import { categoryOf, guessCategory } from "./categories";
import type { MapPin } from "./map-pin";
import { getPlaces } from "./places";
import type { PageCandidate } from "./place-links";
import { freeSlug } from "./slug";
import { PINS_PER_TILE, type Bounds } from "./tiles";
import type { PlaceVideo, VideoProvider } from "./video";

export type { MapPin };

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase is not configured (.env.local).");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export type StoredStory = AiPlace & { id: string; status: "ai" | "verified" | "hidden"; views: number; slug?: string };

type Row = {
  id: string;
  slug?: string | null;
  status: StoredStory["status"];
  story: AiPlace["story"];
  image: AiPlace["image"] | null;
  model: string | null;
  views: number;
  verified_at?: string | null;
};

const toStored = (r: Row): StoredStory => ({
  id: r.id,
  ...(r.slug ? { slug: r.slug } : {}),
  status: r.status,
  story: r.story,
  image: r.image ?? undefined,
  model: r.model ?? "",
  views: r.views,
  ...(r.status === "verified" && r.verified_at ? { verifiedAt: r.verified_at } : {}),
});

/**
 * How far apart two clicks on "the same place" can be, in degrees. A road or
 * river is long (its label can be clicked anywhere along it); a building is a point.
 */
function matchRadius(kind = ""): number {
  if (/city|town|district|state/i.test(kind)) return 0.05; // ~5 km
  if (/road|street|river|canal|lake|water/i.test(kind)) return 0.02; // ~2 km
  if (/suburb|village|neighbou?rhood|quarter|hamlet/i.test(kind)) return 0.01; // ~1 km
  return 0.003; // ~300 m
}

const norm = (s: string) => s.normalize("NFC").trim().toLowerCase();

/** The saved story for this place, if any: same map name, close enough to the click. */
export async function findStory(t: StoryTarget): Promise<StoredStory | undefined> {
  const r = matchRadius(t.kind);
  const { data, error } = await db()
    .from("stories")
    .select("id,slug,status,story,image,model,views,verified_at,lat,lng")
    .eq("name_bn", norm(t.name))
    .gte("lat", t.lat - r)
    .lte("lat", t.lat + r)
    .gte("lng", t.lng - r)
    .lte("lng", t.lng + r)
    .limit(5);
  if (error) throw new Error(`Database: ${error.message}`);
  const nearest = (data ?? []).sort(
    (a, b) => Math.hypot(a.lat - t.lat, a.lng - t.lng) - Math.hypot(b.lat - t.lat, b.lng - t.lng),
  )[0];
  return nearest ? toStored(nearest as Row) : undefined;
}

export async function saveStory(t: StoryTarget, place: AiPlace): Promise<StoredStory> {
  // A unique key stops two visitors generating the same place at once from saving twice.
  const grid = (v: number) => (Math.round(v / matchRadius(t.kind)) * matchRadius(t.kind)).toFixed(4);
  const row = {
    place_key: `near:${norm(t.name)}@${grid(t.lat)},${grid(t.lng)}`,
    name_bn: norm(t.name),
    name_en: place.story.name_en,
    lat: t.lat,
    lng: t.lng,
    kind: t.kind ?? null,
    country: place.story.country ?? null,
    story: place.story,
    image: place.image ?? null,
    model: place.model,
    views: 1,
  };
  const insert = (r: typeof row) =>
    db().from("stories").upsert(r, { onConflict: "place_key", ignoreDuplicates: true }).select("id,slug,status,story,image,model,views,verified_at").maybeSingle();
  let { data, error } = await insert(row);
  // A database that hasn't run the "global countries" migration yet only accepts BD/IN/PK
  // (check constraint, code 23514): save the story anyway, without the country column.
  if (error?.code === "23514" && row.country) ({ data, error } = await insert({ ...row, country: null }));
  if (error) throw new Error(`Database: ${error.message}`);
  if (data) {
    // Every saved place gets its page address at once (/place/<slug>), from its English name.
    const stored = toStored(data as Row);
    const slug = await ensureSlug(stored.id).catch(() => undefined);
    return slug ? { ...stored, slug } : stored;
  }
  // Someone saved it a moment earlier: return theirs.
  const existing = await findStory(t);
  if (!existing) throw new Error("Story could not be saved.");
  return existing;
}

export async function countView(id: string): Promise<void> {
  await db().rpc("bump_story_views", { p_id: id });
}

export async function reportStory(id: string, message: string): Promise<void> {
  const { error } = await db().rpc("add_story_report", { p_id: id, p_message: message.slice(0, 1000) });
  if (error) throw new Error(`Database: ${error.message}`);
}

// ── Limits on new AI stories ───────────────────────────────────────────────────────────────

/** A visitor's IP, hashed with a secret so the raw address is never stored. */
export function visitorId(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const salt = process.env.VISITOR_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHash("sha256").update(salt + ip).digest("hex").slice(0, 32);
}

const PER_HOUR = Number(process.env.AI_LIMIT_PER_HOUR || 10);
const PER_DAY = Number(process.env.AI_LIMIT_PER_DAY || 300);

/** A Bangla message when a new story may not be generated now, otherwise undefined. */
export async function checkLimits(visitor: string): Promise<string | undefined> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [mine, all] = await Promise.all([
    db().from("generation_log").select("id", { count: "exact", head: true }).eq("visitor", visitor).gte("created_at", hourAgo),
    db().from("generation_log").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
  ]);
  if ((mine.count ?? 0) >= PER_HOUR) return "এক ঘণ্টায় অনেকগুলো নতুন গল্প খোলা হয়েছে। একটু পরে আবার চেষ্টা করুন, বা আগে খোলা গল্পগুলো দেখুন।";
  if ((all.count ?? 0) >= PER_DAY) return "আজকের নতুন গল্পের সীমা শেষ। আগে লেখা গল্পগুলো খোলা যাবে; নতুন গল্প কাল আবার।";
  return undefined;
}

export async function logGeneration(visitor: string, placeKey: string): Promise<void> {
  await db().from("generation_log").insert({ visitor, place_key: placeKey });
}

// ── Admin ────────────────────────────────────────────────────────────────────────────────

export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await db().from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

/** The show_on_map column doesn't exist until the show_on_map migration has been run. */
const missingColumn = (code?: string) => code === "42703" || code === "PGRST204";

/** Every saved story, for the admin map (hidden ones too). */
export async function listStories() {
  const list = (columns: string) => db().from("stories").select(columns).order("views", { ascending: false }).limit(5000);
  const base = "id,slug,name_bn,name_en,lat,lng,kind,status,views,reports,updated_at";
  let { data, error } = await list(`${base},show_on_map`);
  // Before the show_on_map migration: list them anyway, all off the map.
  if (missingColumn(error?.code)) ({ data, error } = await list(base));
  if (error) throw new Error(`Database: ${error.message}`);
  // 👍 / 👎 per place (the admin sees both).
  const { reactionTotals } = await import("./reactions");
  const totals = await reactionTotals();
  return ((data ?? []) as unknown as { slug: string | null }[]).map((r) => ({ ...r, likes: 0, dislikes: 0, ...(r.slug ? totals.get(r.slug) : {}) }));
}


/**
 * The pins in one square of the map: stories the admin chose to show (never hidden ones), most
 * important first: checked by an editor, then the most opened, at most `limit` in all. Range
 * queries on lat/lng, served by the stories_lat_lng index. Empty before the show_on_map migration.
 */
export async function listMapPins(b: Bounds, limit = PINS_PER_TILE): Promise<MapPin[]> {
  // What a pin shows: its name, its category chip, and the hover preview (picture, kind · era).
  const base =
    "name_bn,name_en,slug,lat,lng,kind,status,label:story->>name_bn,kind_bn:story->>kind_bn,era:story->>era_label_bn,photo:image->>src,videos:place_videos(thumbnail_url,sort_order)";
  const query = (columns: string, status: "verified" | "ai", n: number) =>
    db()
      .from("stories")
      .select(columns)
      .eq("show_on_map", true)
      .eq("status", status)
      // Edges: south/west inclusive, north/east exclusive, so a pin on a border is in exactly one square.
      .gte("lat", b.south)
      .lt("lat", b.north)
      .gte("lng", b.west)
      .lt("lng", b.east)
      .order("views", { ascending: false })
      .limit(n);

  // Before the category migration: without the editor's choice (the guess still works).
  let columns = `${base},category`;
  let verified = await query(columns, "verified", limit);
  if (missingColumn(verified.error?.code)) verified = await query((columns = base), "verified", limit);
  if (verified.error) {
    if (missingColumn(verified.error.code)) return [];
    throw new Error(`Database: ${verified.error.message}`);
  }
  const room = limit - (verified.data?.length ?? 0);
  const ai = room > 0 ? await query(columns, "ai", room) : { data: [], error: null };
  if (ai.error) throw new Error(`Database: ${ai.error.message}`);

  type PinRow = {
    name_bn: string;
    name_en: string | null;
    slug: string | null;
    lat: number;
    lng: number;
    kind: string | null;
    status: string;
    label: string | null;
    kind_bn: string | null;
    era: string | null;
    photo: string | null;
    videos: { thumbnail_url: string | null; sort_order: number }[] | null;
    category?: string | null;
  };
  const rows = [...(verified.data ?? []), ...(ai.data ?? [])] as unknown as PinRow[];
  const { likesFor } = await import("./reactions");
  const likes = await likesFor(rows.flatMap((r) => (r.slug ? [r.slug] : [])));
  return rows.map((r) => {
    const videos = [...(r.videos ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const thumb = smallPicture(r.photo) ?? smallPicture(videos.find((v) => v.thumbnail_url)?.thumbnail_url);
    const line = [r.kind_bn?.trim(), r.era?.trim()].filter(Boolean).join(" · ");
    const category = categoryOf(r.category, guessCategory({ kind_bn: r.kind_bn, era: r.era }));
    const n = r.slug ? likes.get(r.slug) : undefined;
    return {
      label: r.label?.trim() || r.name_bn,
      label_en: r.name_en?.trim() || undefined,
      slug: r.slug ?? undefined,
      name: r.name_bn,
      lat: r.lat,
      lng: r.lng,
      kind: r.kind ?? undefined,
      verified: r.status === "verified",
      ...(category ? { category } : {}),
      ...(videos.length ? { video: true } : {}),
      ...(thumb ? { thumb } : {}),
      ...(line ? { line } : {}),
      ...(n ? { likes: n } : {}),
    };
  });
}

/**
 * A hover-preview-sized picture: Commons at 500 px (a standard thumbnail width; originals can be
 * many MB), YouTube's medium still. Commons tracking parameters are dropped.
 */
export function smallPicture(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  const url = src.split("?")[0];
  const commons = url.match(/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/(\w+)\/(?:thumb\/)?([0-9a-f]\/[0-9a-f]{2})\/([^/]+)/);
  if (commons) {
    const [, wiki, dir, file] = commons;
    // Only photos have a same-format thumbnail; anything else stays as it was.
    if (!/\.(jpe?g|png|webp)$/i.test(file)) return url;
    return `https://upload.wikimedia.org/wikipedia/${wiki}/thumb/${dir}/${file}/500px-${file}`;
  }
  if (/(ytimg|youtube)\.com\/vi\//.test(url)) return url.replace(/\/(hq|sd|maxres)default\.jpg$/, "/mqdefault.jpg");
  return url;
}

export async function getStoryForAdmin(id: string) {
  const [story, reports] = await Promise.all([
    db().from("stories").select("*").eq("id", id).maybeSingle(),
    db().from("story_reports").select("id,message,created_at").eq("story_id", id).order("created_at", { ascending: false }),
  ]);
  if (story.error) throw new Error(`Database: ${story.error.message}`);
  if (!story.data) return undefined;
  const { reactionTotals } = await import("./reactions");
  const votes = story.data.slug ? (await reactionTotals()).get(story.data.slug) : undefined;
  // The category the map would guess, so the admin shows what "automatic" means for this place.
  const st = story.data.story as { kind_bn?: string; era_label_bn?: string } | null;
  const category_guess = guessCategory({ kind_bn: st?.kind_bn, era: st?.era_label_bn }) ?? null;
  return { ...story.data, category_guess, likes: votes?.likes ?? 0, dislikes: votes?.dislikes ?? 0, report_list: reports.data ?? [], videos: await listVideos(id) };
}

export async function updateStory(id: string, patch: Record<string, unknown>) {
  const update = (p: Record<string, unknown>) => db().from("stories").update(p).eq("id", id).select("*").maybeSingle();
  let { data, error } = await update(patch);
  // Before the "global countries" migration only BD/IN/PK fit the country column (see saveStory).
  if (error?.code === "23514" && patch.country) ({ data, error } = await update({ ...patch, country: null }));
  if (missingColumn(error?.code) && "show_on_map" in patch) {
    throw new Error("The show_on_map column doesn't exist yet: run the show_on_map migration in Supabase.");
  }
  if (missingColumn(error?.code) && "category" in patch) {
    throw new Error("The category column doesn't exist yet: run the story_category migration in Supabase.");
  }
  if (error) throw new Error(`Database: ${error.message}`);
  return data;
}

/** A unique, readable URL name for a verified story: "lalbagh-fort", "lalbagh-fort-2", … */
/** Slugs of the hand-written places (content/): a story never takes one of these by accident. */
const CURATED = new Set(getPlaces().map((p) => p.slug));

/**
 * The story's page address, giving it one if it has none yet: from its English name, with its city
 * on a clash ("-dhaka"), then a number. Never changes once set.
 */
export async function ensureSlug(id: string): Promise<string> {
  const { data, error } = await db().from("stories").select("slug,name_en,story").eq("id", id).maybeSingle();
  if (error) throw new Error(`Database: ${error.message}`);
  if (!data) throw new Error("Story not found");
  if (data.slug) return data.slug as string;
  const story = (data.story ?? {}) as { name_en?: string; locality_en?: string };
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = await freeSlug(data.name_en || story.name_en || "", story.locality_en, async (s) => {
      if (CURATED.has(s)) return true;
      const { data: other } = await db().from("stories").select("id").eq("slug", s).neq("id", id).maybeSingle();
      return !!other;
    });
    const { error: e } = await db().from("stories").update({ slug }).eq("id", id).is("slug", null);
    if (!e) {
      const { data: now } = await db().from("stories").select("slug").eq("id", id).single();
      return now!.slug as string;
    }
    if (e.code !== "23505") throw new Error(`Database: ${e.message}`); // taken a moment ago: try again
  }
  throw new Error("Could not give the story a page address");
}

/** What a place page needs: the saved story by its address, with where it is and whether to index it. */
export type PlacePage = StoredStory & {
  slug: string;
  name_bn: string;
  lat: number;
  lng: number;
  kind: string | null;
  show_on_map: boolean;
  verified_at: string | null;
  updated_at: string;
};

/** Refreshes a story's page (/place/<slug>) after an admin change. Server-side only. */
export async function refreshPlacePage(storyId: string): Promise<void> {
  const { data } = await db().from("stories").select("slug").eq("id", storyId).maybeSingle();
  if (data?.slug) {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/place/${data.slug}`);
  }
}

export async function findStoryBySlug(slug: string): Promise<PlacePage | undefined> {
  let { data, error } = await db()
    .from("stories")
    .select("id,slug,status,story,image,model,views,name_bn,lat,lng,kind,show_on_map,verified_at,updated_at")
    .eq("slug", slug)
    .neq("status", "hidden")
    .maybeSingle();
  // Before the show_on_map migration: the same without it.
  if (missingColumn(error?.code)) {
    ({ data, error } = await db().from("stories").select("id,slug,status,story,image,model,views,name_bn,lat,lng,kind,verified_at,updated_at").eq("slug", slug).neq("status", "hidden").maybeSingle());
  }
  if (error) throw new Error(`Database: ${error.message}`);
  if (!data) return undefined;
  const r = data as Row & { name_bn: string; lat: number; lng: number; kind: string | null; show_on_map?: boolean; verified_at: string | null; updated_at: string };
  return { ...toStored(r), slug, name_bn: r.name_bn, lat: r.lat, lng: r.lng, kind: r.kind, show_on_map: !!r.show_on_map, verified_at: r.verified_at, updated_at: r.updated_at };
}

/** Every place with a page, for the sitemap: its address, last change, and whether it is pinned. */
export async function listPlacePages(): Promise<{ slug: string; updated_at: string; show_on_map: boolean }[]> {
  const { data, error } = await db().from("stories").select("slug,updated_at,show_on_map").not("slug", "is", null).neq("status", "hidden");
  if (error) return [];
  return (data ?? []) as { slug: string; updated_at: string; show_on_map: boolean }[];
}

/**
 * Every place with a page, for linking to it from other content (On this day): hand-written pages
 * and saved map stories, with the names they go by. Server-side only.
 */
export async function listPageCandidates(): Promise<PageCandidate[]> {
  const curated: PageCandidate[] = getPlaces().map((p) => ({ slug: p.slug, names: [p.name.bn, p.name.en].filter((n): n is string => !!n), lat: p.location.lat, lng: p.location.lng }));
  const { data, error } = await db()
    .from("stories")
    .select("slug,name_bn,name_en,lat,lng,label:story->>name_bn")
    .not("slug", "is", null)
    .neq("status", "hidden");
  if (error) return curated;
  const stories = (data ?? []).map((r) => ({
    slug: r.slug as string,
    names: [r.label, r.name_bn, r.name_en].filter((n): n is string => !!n),
    lat: r.lat as number,
    lng: r.lng as number,
  }));
  // A hand-written page comes first: an AI story sharing its address is the same place.
  const seen = new Set(curated.map((c) => c.slug));
  return [...curated, ...stories.filter((s) => !seen.has(s.slug))];
}

export async function clearReports(id: string) {
  await db().from("story_reports").delete().eq("story_id", id);
  await db().from("stories").update({ reports: 0 }).eq("id", id);
}

// ── Videos (place_videos) ─────────────────────────────────────────────────────────────────

type VideoRow = {
  id: string;
  video_provider: VideoProvider;
  provider_video_id: string;
  video_url: string;
  video_title: string;
  language: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  published_at: string | null;
};

const VIDEO_COLUMNS =
  "id,video_provider,provider_video_id,video_url,video_title,language,duration_seconds,thumbnail_url,published_at";

const toVideo = (r: VideoRow): PlaceVideo => ({
  id: r.id,
  provider: r.video_provider,
  providerVideoId: r.provider_video_id,
  url: r.video_url,
  title: r.video_title,
  language: r.language,
  durationSeconds: r.duration_seconds ?? undefined,
  thumbnailUrl: r.thumbnail_url ?? undefined,
  publishedAt: r.published_at ?? undefined,
});

/** The table doesn't exist until the place_videos migration has been run. */
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

/** A place's videos, main one first. Empty (never an error) if the videos table isn't there yet. */
export async function listVideos(storyId: string): Promise<PlaceVideo[]> {
  const { data, error } = await db()
    .from("place_videos")
    .select(VIDEO_COLUMNS)
    .eq("story_id", storyId)
    .order("sort_order")
    .order("created_at");
  if (error) {
    if (!missingTable(error.code)) console.error(`Database: ${error.message}`);
    return [];
  }
  return (data as VideoRow[]).map(toVideo);
}

export type NewVideo = {
  provider: VideoProvider;
  providerVideoId: string;
  url: string;
  title: string;
  language: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  publishedAt?: string;
};

export async function addVideo(storyId: string, v: NewVideo): Promise<PlaceVideo> {
  const existing = await listVideos(storyId);
  const { data, error } = await db()
    .from("place_videos")
    .insert({
      story_id: storyId,
      video_provider: v.provider,
      provider_video_id: v.providerVideoId,
      video_url: v.url,
      video_title: v.title,
      language: v.language,
      duration_seconds: v.durationSeconds ?? null,
      thumbnail_url: v.thumbnailUrl ?? null,
      published_at: v.publishedAt ?? null,
      sort_order: existing.length,
    })
    .select(VIDEO_COLUMNS)
    .single();
  if (error) {
    if (missingTable(error.code)) throw new Error("The videos table doesn't exist yet: run the place_videos migration in Supabase.");
    if (error.code === "23505") throw new Error("This video is already added to this place.");
    throw new Error(`Database: ${error.message}`);
  }
  return toVideo(data as VideoRow);
}

export async function deleteVideo(storyId: string, videoId: string): Promise<void> {
  const { error } = await db().from("place_videos").delete().eq("id", videoId).eq("story_id", storyId);
  if (error) throw new Error(`Database: ${error.message}`);
}

/** Makes a video the main one (first), keeping the others in their order. */
export async function makeMainVideo(storyId: string, videoId: string): Promise<void> {
  const videos = await listVideos(storyId);
  const order = [videoId, ...videos.map((v) => v.id).filter((id) => id !== videoId)];
  for (const [i, id] of order.entries()) {
    const { error } = await db().from("place_videos").update({ sort_order: i }).eq("id", id).eq("story_id", storyId);
    if (error) throw new Error(`Database: ${error.message}`);
  }
}
