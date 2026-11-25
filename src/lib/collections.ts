/**
 * Collections: hand-picked sets of places in order ("UNESCO ঐতিহ্য", "১৯৭১-এর ঢাকা"), made in the
 * admin, shown on the map (সংগ্রহ) and at /collection/<slug>. Server-side only (service key).
 * Before the collections migration has been run, everything here is simply empty.
 */
import { z } from "zod";
import { db, PIN_COLUMNS, toMapPins, type PinRow } from "./db";
import type { MapPin } from "./map-pin";

/** The tables don't exist until the collections migration has been run. */
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205" || code === "PGRST200";

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A collection as the visitors' list shows it. */
export type CollectionCard = {
  slug: string;
  title_bn: string;
  title_en: string | null;
  intro_bn: string | null;
  count: number;
  /** A small picture: the first place's that has one. */
  thumb?: string;
};

/** One place in a collection: its pin (opens like any pin) and the collection's own line about it. */
export type CollectionPlace = MapPin & { story_id: string; note_bn?: string };

export type PublicCollection = Omit<CollectionCard, "count" | "thumb"> & { places: CollectionPlace[] };

type Row = { id: string; slug: string; title_bn: string; title_en: string | null; intro_bn: string | null; status: string; sort_order: number; created_at: string; updated_at: string };
type Link = { story_id: string; position: number; note_bn: string | null };

/** Places of these collections, in order (hidden stories are left out). */
async function placesOf(ids: string[]): Promise<Map<string, CollectionPlace[]>> {
  const out = new Map<string, CollectionPlace[]>(ids.map((id) => [id, []]));
  if (!ids.length) return out;
  const links = await db().from("collection_places").select("collection_id,story_id,position,note_bn").in("collection_id", ids).order("position");
  if (links.error) throw new Error(`Database: ${links.error.message}`);
  const all = (links.data ?? []) as (Link & { collection_id: string })[];
  const storyIds = [...new Set(all.map((l) => l.story_id))];
  if (!storyIds.length) return out;
  const select = (cols: string) => db().from("stories").select(`id,${cols}`).in("id", storyIds).neq("status", "hidden");
  let stories = await select(`${PIN_COLUMNS},category`);
  if (stories.error?.code === "42703" || stories.error?.code === "PGRST204") stories = await select(PIN_COLUMNS);
  if (stories.error) throw new Error(`Database: ${stories.error.message}`);
  const rows = (stories.data ?? []) as unknown as (PinRow & { id: string })[];
  const pins = await toMapPins(rows);
  const byId = new Map(rows.map((r, i) => [r.id, pins[i]]));
  for (const l of all) {
    const pin = byId.get(l.story_id);
    if (pin) out.get(l.collection_id)!.push({ ...pin, story_id: l.story_id, ...(l.note_bn ? { note_bn: l.note_bn } : {}) });
  }
  return out;
}

const toCard = (r: Row, list: CollectionPlace[]): CollectionCard => {
  const thumb = list.find((p) => p.thumb)?.thumb;
  return { slug: r.slug, title_bn: r.title_bn, title_en: r.title_en, intro_bn: r.intro_bn, count: list.length, ...(thumb ? { thumb } : {}) };
};

/** Every published collection (the sitemap). */
export async function publishedCollections(): Promise<CollectionCard[]> {
  return (await publishedPage(0, 1000)).collections;
}

/** One page of published collections, in the visitors' order, and how many there are in all. */
export async function publishedPage(offset: number, limit: number): Promise<{ collections: CollectionCard[]; total: number }> {
  const { data, error, count } = await db()
    .from("collections")
    .select("*", { count: "exact" })
    .eq("status", "published")
    .order("sort_order")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (missingTable(error?.code)) return { collections: [], total: 0 };
  if (error) throw new Error(`Database: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const places = await placesOf(rows.map((r) => r.id));
  return { collections: rows.map((r) => toCard(r, places.get(r.id) ?? [])), total: count ?? rows.length };
}

/** One published collection with its places (undefined: no such collection, or not published). */
export async function publishedCollection(slug: string): Promise<PublicCollection | undefined> {
  if (!SLUG_RE.test(slug)) return undefined;
  const { data, error } = await db().from("collections").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (missingTable(error?.code)) return undefined;
  if (error) throw new Error(`Database: ${error.message}`);
  if (!data) return undefined;
  const r = data as Row;
  const places = (await placesOf([r.id])).get(r.id) ?? [];
  return { slug: r.slug, title_bn: r.title_bn, title_en: r.title_en, intro_bn: r.intro_bn, places };
}

// ---- Admin ----

export type AdminCollection = Row & { places: CollectionPlace[] };

/** Every collection (drafts too), newest first, with its places. null: the migration hasn't been run. */
export async function adminCollections(): Promise<AdminCollection[] | null> {
  const { data, error } = await db().from("collections").select("*").order("sort_order").order("created_at", { ascending: false });
  if (missingTable(error?.code)) return null;
  if (error) throw new Error(`Database: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const places = await placesOf(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, places: places.get(r.id) ?? [] }));
}

/** What the admin sends when saving a collection. */
export const CollectionInput = z.object({
  slug: z.string().trim().max(80).regex(SLUG_RE, "Address: lower-case English letters, digits and dashes only"),
  title_bn: z.string().trim().min(1, "Bangla title is required").max(120),
  title_en: z.string().trim().max(120).nullish(),
  intro_bn: z.string().trim().max(2000).nullish(),
  status: z.enum(["draft", "published"]),
  sort_order: z.number().int().min(-1000).max(1000).default(0),
  places: z.array(z.object({ story_id: z.string().uuid(), note_bn: z.string().trim().max(500).nullish() })).max(200),
});
export type CollectionInput = z.infer<typeof CollectionInput>;

const conflict = (code?: string) => code === "23505";

/** Creates or replaces a collection (its places are replaced in the order given). Returns its id. */
export async function saveCollection(id: string | null, input: CollectionInput): Promise<string> {
  const fields = {
    slug: input.slug,
    title_bn: input.title_bn,
    title_en: input.title_en || null,
    intro_bn: input.intro_bn || null,
    status: input.status,
    sort_order: input.sort_order,
    updated_at: new Date().toISOString(),
  };
  const res = id ? await db().from("collections").update(fields).eq("id", id).select("id").maybeSingle() : await db().from("collections").insert(fields).select("id").single();
  if (missingTable(res.error?.code)) throw new Error("The collections tables don't exist yet: run the collections migration in Supabase.");
  if (conflict(res.error?.code)) throw new Error(`Another collection already uses the address "${input.slug}".`);
  if (res.error) throw new Error(`Database: ${res.error.message}`);
  if (!res.data) throw new Error("Not found");
  const cid = (res.data as { id: string }).id;
  // Places: replace them all (a collection is small), in the order given, each once.
  const seen = new Set<string>();
  const rows = input.places
    .filter((p) => !seen.has(p.story_id) && seen.add(p.story_id))
    .map((p, i) => ({ collection_id: cid, story_id: p.story_id, position: i, note_bn: p.note_bn || null }));
  const del = await db().from("collection_places").delete().eq("collection_id", cid);
  if (del.error) throw new Error(`Database: ${del.error.message}`);
  if (rows.length) {
    const ins = await db().from("collection_places").insert(rows);
    if (ins.error) throw new Error(`Database: ${ins.error.message}`);
  }
  return cid;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await db().from("collections").delete().eq("id", id);
  if (error) throw new Error(`Database: ${error.message}`);
}
