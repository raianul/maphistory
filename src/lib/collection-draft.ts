/**
 * "Draft with AI" for a collection: from its title, Gemini (with Google Search) suggests the
 * English title, a short Bangla intro and 5–10 real places in a sensible order, each with a line on
 * why it belongs. The answer is untrusted: every place is then looked up on OpenStreetMap (its real
 * location, inside Bangladesh) and matched against the stories already saved. Nothing is saved
 * here. Server-side only.
 */
import { z } from "zod";
import { askGemini, extractJson } from "./research/discover";
import { db } from "./db";
import { searchPlaces, type GeoResult } from "./geocode";
import { inRegion } from "./region";

export type DraftPlace = {
  name_bn: string;
  name_en: string;
  note_bn: string;
  lat: number;
  lng: number;
  /** What OpenStreetMap says it is (e.g. "amenity=place_of_worship"); empty when the AI's own location was used. */
  kind: string;
  /** No OpenStreetMap match: the AI's own coordinates (check the pin). */
  approximate: boolean;
  /** Already saved on the site: that story. */
  story_id: string | null;
  /** The saved story's name, when it is one. */
  label?: string;
};

export type CollectionDraft = {
  title_en: string;
  intro_bn: string;
  places: DraftPlace[];
  /** Suggestions that couldn't be placed on the map (name and why). */
  dropped: { name: string; reason: string }[];
};

const RawPlace = z.object({
  name_bn: z.string().trim().min(1).max(120),
  name_en: z.string().trim().max(160).catch(""),
  note_bn: z.string().trim().max(300).catch(""),
  lat: z.number().optional().catch(undefined),
  lng: z.number().optional().catch(undefined),
});
const RawDraft = z.object({
  title_en: z.string().trim().max(120).catch(""),
  intro_bn: z.string().trim().max(1200).catch(""),
  places: z.array(z.unknown()).max(15).catch([]),
});

export function draftPrompt(title_bn: string, title_en?: string): string {
  return `You are a careful historian of Bangladesh and a travel writer, making a themed collection of places for "Place & Past", a Bangla map of the history of places in Bangladesh.

The collection's title: "${title_bn}"${title_en ? ` (English: "${title_en}")` : ""}

Using Google Search, choose 5 to 10 REAL places in Bangladesh that fit this title. Rules:
1. Each must be a physical place a person can visit and find on a map (a building, monument, site, park, street, river ghat…), not an event or a person. It must be inside present-day Bangladesh.
2. Only places that really exist and that you found on a reliable page (Wikipedia, Banglapedia, government, university, major newspaper). Never invent a place.
3. Put them in a sensible order: a walking or travel route when they are close together, otherwise by date.
4. name_en: the place's usual English name, as on Wikipedia or OpenStreetMap (it will be searched on OpenStreetMap). name_bn: its usual Bangla name.
5. note_bn: one short Bangla sentence (at most 20 words) on why this place belongs in this collection.
6. lat and lng: your best estimate of its location, in decimal degrees.
7. title_en: a short English title for the collection (keep the one given, if any). intro_bn: one or two clear, modern Bangla sentences introducing the collection.

Reply with ONLY this JSON, nothing else:
{"title_en":"...","intro_bn":"...","places":[{"name_bn":"...","name_en":"...","note_bn":"...","lat":23.7,"lng":90.4}]}`;
}

/** Bangla names compared without spaces, dashes and the hasant/nukta variants that differ by typing. */
const same = (a: string, b: string) => {
  const n = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s\-–—.,'’()]/g, "");
  return !!a && !!b && (n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a)));
};

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

/** The place's real location: an OpenStreetMap result near the AI's guess (or the best match). */
async function locate(p: z.infer<typeof RawPlace>, search: typeof searchPlaces): Promise<GeoResult | undefined> {
  const guess = p.lat !== undefined && p.lng !== undefined && inRegion(p.lat, p.lng) ? { lat: p.lat, lng: p.lng } : undefined;
  for (const q of [p.name_en, p.name_bn].filter(Boolean)) {
    const results = (await search(q)) ?? [];
    if (!results.length) continue;
    if (!guess) return results[0];
    const near = results.map((r) => ({ r, d: km(r, guess) })).sort((a, b) => a.d - b.d)[0];
    // A same-named place elsewhere in the country is a different place.
    if (near.d <= 5) return near.r;
  }
  return undefined;
}

/** A story already saved for this place: same name nearby, or anything right on the spot. */
async function savedStory(p: { name_bn: string; name_en: string; lat: number; lng: number }): Promise<{ id: string; label: string } | undefined> {
  const r = 0.006; // about 600 m
  const { data, error } = await db()
    .from("stories")
    .select("id,name_bn,name_en,lat,lng,status,label:story->>name_bn")
    .gte("lat", p.lat - r)
    .lte("lat", p.lat + r)
    .gte("lng", p.lng - r)
    .lte("lng", p.lng + r)
    .neq("status", "hidden")
    .limit(50);
  if (error) throw new Error(`Database: ${error.message}`);
  type Row = { id: string; name_bn: string; name_en: string | null; lat: number; lng: number; label: string | null };
  const rows = ((data ?? []) as Row[]).map((s) => ({ ...s, d: km(s, p) })).sort((a, b) => a.d - b.d);
  const hit =
    rows.find((s) => same(s.name_bn, p.name_bn) || same(s.label ?? "", p.name_bn) || same(s.name_en ?? "", p.name_en)) ??
    rows.find((s) => s.d <= 0.12);
  return hit ? { id: hit.id, label: hit.label?.trim() || hit.name_bn } : undefined;
}

export async function draftCollection(
  title_bn: string,
  title_en?: string,
  deps: { ask?: (prompt: string) => Promise<string>; search?: typeof searchPlaces } = {},
): Promise<CollectionDraft> {
  const text = await (deps.ask ?? askGemini)(draftPrompt(title_bn, title_en));
  const parsed = RawDraft.safeParse(extractJson(text));
  if (!parsed.success) throw new Error("Could not read the AI's answer. Try again.");
  const search = deps.search ?? searchPlaces;
  const places: DraftPlace[] = [];
  const dropped: CollectionDraft["dropped"] = [];
  // One place at a time: the free map search asks for gentle use.
  for (const item of parsed.data.places) {
    const p = RawPlace.safeParse(item);
    if (!p.success) continue;
    const found = await locate(p.data, search).catch(() => undefined);
    const ai = p.data.lat !== undefined && p.data.lng !== undefined && inRegion(p.data.lat, p.data.lng) ? { lat: p.data.lat, lng: p.data.lng } : undefined;
    const at = found ?? ai;
    if (!at) {
      dropped.push({ name: p.data.name_bn, reason: "not found on the map in Bangladesh" });
      continue;
    }
    // The same place twice (two names for one spot): keep the first.
    if (places.some((q) => km(q, at) < 0.05)) continue;
    const base = { name_bn: p.data.name_bn, name_en: p.data.name_en, note_bn: p.data.note_bn, lat: at.lat, lng: at.lng };
    const saved = await savedStory(base).catch(() => undefined);
    places.push({
      ...base,
      kind: found?.kind ?? "",
      approximate: !found,
      story_id: saved?.id ?? null,
      ...(saved ? { label: saved.label } : {}),
    });
  }
  return { title_en: parsed.data.title_en || title_en || "", intro_bn: parsed.data.intro_bn, places, dropped };
}
