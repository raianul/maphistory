/**
 * Picks a photo that actually shows the clicked place, most reliable first:
 *   1. the Wikidata main image of that place (matched by name AND location);
 *   2. a geotagged Commons photo taken near the spot whose title names it;
 *   3. a Commons search for the AI's photo phrase ("Saidpur railway workshop"),
 *      checked against the location when the photo has coordinates;
 *   4. nothing: no photo beats a wrong photo.
 * Only allowed licences (see checkLicense). Server-side only.
 */
import type { CreditT } from "../schema";
import { findCommonsImages, findCommonsImagesNear, type CommonsImage } from "./commons";
import { WIKI_HEADERS } from "./wiki";

export type Photo = { src: string; credit: CreditT; how: "wikidata" | "nearby" | "search" };

export type PhotoHints = {
  /** English name from the AI, e.g. "Saidpur". */
  nameEn?: string;
  /** The AI's search phrase for the most telling view, e.g. "Saidpur railway workshop". */
  query?: string;
};

type Point = { lat: number; lng: number };

const km = (a: Point, b: Point) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** How far a matching photo or Wikidata item may be from the click, by kind of place. */
export function radiusKm(kind = ""): number {
  if (/city|town|state|district/i.test(kind)) return 15;
  if (/suburb|village|neighbou?rhood|quarter|hamlet|island|river|canal|lake|water/i.test(kind)) return 4;
  if (/road|street/i.test(kind)) return 3;
  return 1.5;
}

// File names that point to news, events, documents or graphics rather than the place itself.
const JUNK = /press|meeting|visit|minister|seminar|conference|rally|inaugurat|ceremony|programme|program|award|logo|map|flag|signature|portrait|poster|banner|screenshot|diagram|chart|stamp|coin|banknote|note\b/i;
const STOP = new Set(["dhaka", "bangladesh", "road", "street", "district", "upazila", "union", "city", "town", "the", "and", "view", "old"]);

const tokens = (s = "") =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));

const usable = (img: CommonsImage) => img.allowed && img.width >= 600 && !JUNK.test(img.file);

const toPhoto = (img: CommonsImage, how: Photo["how"]): Photo => ({ src: img.downloadUrl, credit: img.credit, how });

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: WIKI_HEADERS });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json() as Promise<T>;
}

type Entity = { claims?: Record<string, { mainsnak?: { datavalue?: { value: unknown } } }[]>; labels?: Record<string, { value: string }> };

// Words that only qualify a place's name: "সৈয়দপুর উপজেলা", "Saidpur, Nilphamari", "Star Mosque, Dhaka".
const QUALIFIER = /[,(].*$|\s+(উপজেলা|পৌরসভা|থানা|ইউনিয়ন|শহর|জেলা|upazila|municipality|thana|union|city|town|district)$/i;
const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(QUALIFIER, "").replace(/\s+/g, " ").trim();

/**
 * Step 1: the Wikidata item that IS the clicked place (its label matches the
 * name, ignoring qualifiers) and lies near the click; its main image.
 */
async function wikidataPhoto(name: string, at: Point, maxKm: number): Promise<Photo | undefined> {
  const lang = /[ঀ-৿]/.test(name) ? "bn" : "en";
  const found = await getJson<{ search?: { id: string }[] }>(
    "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({ action: "wbsearchentities", format: "json", search: name, language: lang, uselang: lang, type: "item", limit: "10" }),
  );
  const ids = found.search?.map((s) => s.id) ?? [];
  if (!ids.length) return undefined;
  const data = await getJson<{ entities: Record<string, Entity> }>(
    "https://www.wikidata.org/w/api.php?" +
      new URLSearchParams({ action: "wbgetentities", format: "json", ids: ids.join("|"), props: "claims|labels", languages: "bn|en" }),
  );
  const wanted = norm(name);
  const candidates = Object.values(data.entities)
    .map((e) => {
      const c = e.claims?.P625?.[0]?.mainsnak?.datavalue?.value as { latitude: number; longitude: number } | undefined;
      const image = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value as string | undefined;
      const labels = Object.values(e.labels ?? {}).map((l) => norm(l.value));
      if (!c || !image || !labels.includes(wanted)) return undefined;
      return { image, d: km(at, { lat: c.latitude, lng: c.longitude }) };
    })
    .filter((c): c is { image: string; d: number } => !!c && c.d <= maxKm)
    .sort((a, b) => a.d - b.d);
  for (const c of candidates) {
    const [img] = await findCommonsImages({ mainImage: c.image });
    // The editors' chosen image: only the licence and a lower size bar (the panel is 440px wide).
    if (img?.allowed && img.width >= 400) return toPhoto(img, "wikidata");
  }
  return undefined;
}

/** Best of a list by how many name/query words its file name contains; at least one name word required. */
function bestMatch(images: CommonsImage[], hints: PhotoHints): CommonsImage | undefined {
  const name = tokens(hints.nameEn);
  if (!name.length) return undefined;
  const extra = tokens(hints.query).filter((t) => !name.includes(t));
  return images
    .filter(usable)
    .map((img) => {
      const f = img.file.toLowerCase();
      const nameHits = name.filter((t) => f.includes(t)).length;
      return { img, nameHits, score: nameHits * 2 + extra.filter((t) => f.includes(t)).length };
    })
    .filter((c) => c.nameHits > 0)
    .sort((a, b) => b.score - a.score || b.img.width - a.img.width)[0]?.img;
}

/**
 * `hints` resolves once the AI has written the English name and photo
 * phrase; steps 1 and 2 start before that, as soon as the click arrives.
 */
export async function findPlacePhoto(
  target: { name: string; lat: number; lng: number; kind?: string },
  hints: Promise<PhotoHints>,
): Promise<Photo | undefined> {
  const at = { lat: target.lat, lng: target.lng };
  const maxKm = radiusKm(target.kind);
  const fromWikidata = wikidataPhoto(target.name, at, maxKm).catch(() => undefined);
  const nearby = findCommonsImagesNear(at.lat, at.lng, maxKm * 1000).catch(() => [] as CommonsImage[]);

  const first = await fromWikidata;
  if (first) return first;

  const h = await hints;
  // The Bangla label may differ on Wikidata ("তারা মসজিদ" vs "Star Mosque"): try the English name too.
  if (h.nameEn && h.nameEn !== target.name) {
    const second = await wikidataPhoto(h.nameEn, at, maxKm).catch(() => undefined);
    if (second) return second;
  }
  const near = bestMatch(await nearby, h);
  if (near) return toPhoto(near, "nearby");

  if (h.query) {
    const results = await findCommonsImages({ search: h.query, limit: 20 }).catch(() => [] as CommonsImage[]);
    // Geotagged results must be near the place; untagged ones must at least name it.
    const placed = results.filter((img) => !img.coords || km(at, img.coords) <= maxKm * 2);
    const hit = bestMatch(placed, h);
    if (hit) return toPhoto(hit, "search");
  }
  return undefined;
}
