/**
 * Wikimedia Commons photos with an automatic licence check. Only files
 * from Commons itself are used: non-free "fair use" images live on
 * Wikipedia, not Commons, so they can never come through here.
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CreditT } from "../schema";
import { WIKI_HEADERS } from "./wiki";

const API = "https://commons.wikimedia.org/w/api.php";

export type CommonsImage = {
  file: string;
  pageUrl: string;
  thumbUrl: string;
  /** A large rendition (1280px wide at most) used when downloading. */
  downloadUrl: string;
  width: number;
  height: number;
  credit: CreditT;
  allowed: boolean;
  reason?: string;
  restrictions?: string;
  /** Where the photo was taken, when the file is geotagged. */
  coords?: { lat: number; lng: number };
};

/**
 * Allowed: public domain, CC0, CC BY, CC BY-SA (any version).
 * Rejected: NonCommercial (ads or partners later), NoDerivatives (no
 * cropping), GFDL-only (needs the full licence text), anything unknown.
 */
export function checkLicense(shortName: string): { allowed: boolean; reason?: string } {
  const l = shortName.trim().toLowerCase();
  if (!l) return { allowed: false, reason: "No licence information" };
  if (/\bnc\b|non-?commercial/.test(l)) return { allowed: false, reason: "NonCommercial: not allowed for a site with ads" };
  if (/\bnd\b|no-?deriv/.test(l)) return { allowed: false, reason: "NoDerivatives: cropping not allowed" };
  if (/^(cc0|public domain|pd\b|pd-)/.test(l)) return { allowed: true };
  if (/^cc[ -]by(-sa)?([ -]\d(\.\d)?)?(\b|$)/.test(l)) return { allowed: true };
  if (/gfdl/.test(l)) return { allowed: false, reason: "GFDL only: needs the full licence text" };
  return { allowed: false, reason: `Unrecognised licence: ${shortName}` };
}

/** Commons metadata fields are HTML; credits need plain text. */
function plain(html = ""): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Meta = Record<string, { value: string } | undefined>;
type Page = {
  title: string;
  coordinates?: { lat: number; lon: number }[];
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime: string;
    extmetadata?: Meta;
  }[];
};

const USABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function toImage(page: Page): CommonsImage | undefined {
  const info = page.imageinfo?.[0];
  if (!info || !USABLE.has(info.mime)) return undefined;
  const m = info.extmetadata ?? {};
  const license = plain(m.LicenseShortName?.value);
  const check = checkLicense(license);
  const file = page.title.replace(/^File:/, "");
  const restrictions = plain(m.Restrictions?.value);
  return {
    file,
    pageUrl: info.descriptionurl,
    // Commons only serves standard thumbnail widths (250, 330, 500, 960, 1280, …).
    thumbUrl: info.thumburl ? info.thumburl.replace(/\/\d+px-/, "/500px-") : info.url,
    downloadUrl: info.thumburl ?? info.url,
    width: info.width,
    height: info.height,
    credit: {
      title: file,
      author: plain(m.Artist?.value) || "Unknown author",
      license: license || "Unknown",
      licenseUrl: m.LicenseUrl?.value || undefined,
      sourceUrl: info.descriptionurl,
    },
    ...check,
    restrictions: restrictions || undefined,
    coords: page.coordinates?.[0] ? { lat: page.coordinates[0].lat, lng: page.coordinates[0].lon } : undefined,
  };
}

async function query(params: Record<string, string>, width: number): Promise<Page[]> {
  const search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo|coordinates",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(width),
    ...params,
  });
  const res = await fetch(`${API}?${search}`, { headers: WIKI_HEADERS });
  if (!res.ok) throw new Error(`${res.status} from Commons`);
  const data = (await res.json()) as { query?: { pages?: Page[] } };
  return data.query?.pages ?? [];
}

/**
 * Photos for a place: the Wikidata main image first, then its Commons
 * category, then a text search. Disallowed licences are kept in the list
 * (with the reason) but can't be picked.
 */
export async function findCommonsImages(opts: {
  mainImage?: string;
  category?: string;
  search?: string;
  limit?: number;
}): Promise<CommonsImage[]> {
  const limit = String(opts.limit ?? 30);
  const batches: Promise<Page[]>[] = [];
  const add = (params: Record<string, string>) => batches.push(query(params, 1280));
  if (opts.mainImage) add({ titles: `File:${opts.mainImage}` });
  if (opts.category) add({ generator: "categorymembers", gcmtitle: `Category:${opts.category}`, gcmtype: "file", gcmlimit: limit });
  if (opts.search) add({ generator: "search", gsrsearch: opts.search, gsrnamespace: "6", gsrlimit: limit });

  const pages = (await Promise.all(batches)).flat();
  const seen = new Set<string>();
  const images: CommonsImage[] = [];
  for (const p of pages) {
    if (seen.has(p.title)) continue;
    seen.add(p.title);
    const img = toImage(p);
    if (img) images.push(img);
  }
  return images;
}

/** Downloads a picked image into content/places/<slug>/images/<name>. */
export async function downloadImage(img: CommonsImage, dir: string, name: string): Promise<void> {
  const res = await fetch(img.downloadUrl, { headers: WIKI_HEADERS });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${img.file}`);
  await mkdir(dir, { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(join(dir, name)));
}

/** Geotagged Commons photos taken within `radiusM` metres of a point (Commons allows up to 10 km). */
export async function findCommonsImagesNear(lat: number, lng: number, radiusM: number, limit = 50): Promise<CommonsImage[]> {
  const pages = await query(
    {
      generator: "geosearch",
      ggscoord: `${lat}|${lng}`,
      ggsradius: String(Math.min(Math.max(radiusM, 10), 10_000)),
      ggsnamespace: "6",
      ggslimit: String(limit),
    },
    1280,
  );
  return pages.map(toImage).filter((i): i is CommonsImage => !!i);
}
