/**
 * Page addresses for places: /place/<slug>. Lowercase ASCII words from the place's English name
 * ("Jatiyo Sangsad Bhaban" → "jatiyo-sangsad-bhaban"). Once saved, a slug never changes, so
 * shared links and search results keep working. Client-safe.
 */

/** "Jatiyo Sangsad Bhaban" → "jatiyo-sangsad-bhaban" (at most 8 words, 70 characters). */
export function slugBase(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 8)
    .join("-")
    .slice(0, 70)
    .replace(/-+$/, "");
}

/** The city or district from an address like "Babu Bazar, Dhaka, Dhaka Division, Bangladesh" → "dhaka". */
export function cityPart(locality: string | null | undefined): string {
  const parts = (locality ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/\b(division|district|bangladesh|upazila|country)\b/i.test(p));
  return slugBase(parts.at(-1) ?? "");
}

/**
 * A free slug for a place: its English name; on a clash, with its city added ("-dhaka"); then a
 * number. `taken` says whether a slug is already used (by another place or a hand-written page).
 */
export async function freeSlug(nameEn: string, locality: string | null | undefined, taken: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugBase(nameEn) || "place";
  if (!(await taken(root))) return root;
  const city = cityPart(locality);
  const withCity = city && !root.endsWith(city) ? `${root}-${city}` : root;
  if (withCity !== root && !(await taken(withCity))) return withCity;
  for (let n = 2; n < 100; n++) if (!(await taken(`${withCity}-${n}`))) return `${withCity}-${n}`;
  return `${withCity}-${Date.now().toString(36)}`;
}

/** Whether a string is a well-formed place slug (what /place/<slug> accepts). */
export const isPlaceSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length <= 80;
