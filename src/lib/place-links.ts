/**
 * Links from other content to place pages: "On this day" names places (ঢাকা বিশ্ববিদ্যালয়,
 * জাতীয় সংসদ ভবন) that may have their own page (/place/<slug>). A place is linked only when the
 * name matches AND it is within 200 m, so a step "near" a page never links to the wrong place.
 */
import { haversine } from "./format";

export type PageCandidate = { slug: string; names: string[]; lat: number; lng: number };

const MAX_METERS = 200;

/** "জাতীয় সংসদ ভবন, ঢাকা" → "জাতীয় সংসদ ভবন": lower case, no punctuation, the part before a comma. */
export function placeNameKey(name: string): string {
  return name
    .split(/[,،(]/)[0]
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

function sameName(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // One contains the other ("সংসদ ভবন" / "জাতীয় সংসদ ভবন"), but not a bare short word ("ঢাকা").
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 6 && short.includes(" ") && long.includes(short);
}

/** The page of the place a name and point refer to, if there is one: the nearest that matches. */
export function findPlacePage(
  pages: PageCandidate[],
  place: { name?: string | null; lat?: number | null; lng?: number | null },
): string | undefined {
  if (!place.name || place.lat == null || place.lng == null) return undefined;
  const key = placeNameKey(place.name);
  let best: { slug: string; d: number } | undefined;
  for (const p of pages) {
    const d = haversine({ lat: place.lat, lng: place.lng }, p);
    if (d > MAX_METERS || (best && d >= best.d)) continue;
    if (p.names.some((n) => sameName(key, placeNameKey(n)))) best = { slug: p.slug, d };
  }
  return best?.slug;
}
