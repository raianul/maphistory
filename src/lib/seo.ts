/**
 * What search engines and link previews see for a place page (/place/<slug>): title, description,
 * share image and structured data (JSON-LD). One source for the page's <head>, its JSON-LD and its
 * share card, for hand-written places and AI map stories alike. Server-side only.
 */
import type { PlacePage } from "./db";
import { bnYear, ERA_META } from "./format";
import { SITE } from "./places";
import type { Place } from "./schema";
import type { PlaceVideo } from "./video";

export type PlaceSeo = {
  slug: string;
  name: string;
  /** Other names: English, earlier names. */
  alternateNames: string[];
  /** A few words on what it is, for the title: "সংসদ ভবন · ১৯৮২". */
  hook?: string;
  description: string;
  /** The card's second line: era and when it began. */
  line?: string;
  /** The place's photo (absolute URL, or a /public path). */
  photo?: string;
  lat: number;
  lng: number;
  city?: string;
  /** Building-like places are also LandmarksOrHistoricalBuildings. */
  building: boolean;
  video?: PlaceVideo;
  /** Last change (ISO). */
  updated?: string;
  indexable: boolean;
};

const BUILDING = /ভবন|মসজিদ|মন্দির|গির্জা|দুর্গ|কেল্লা|প্রাসাদ|মঞ্জিল|স্মৃতিসৌধ|সৌধ|মিনার|বাড়ি|কুঠি|জমিদার|প্রত্নস্থল|বিহার|স্টেডিয়াম|স্থাপনা|সমাধি|মাজার|দরগা|প্যাগোডা|টাওয়ার|গেট|তোরণ|সেতু/;

/** At most `max` characters, cut at a word and ended with "…" when shortened. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:।—-]+$/, "")}…`;
}

/**
 * The one-line hook for share previews and search results: the summary's first sentence (ending
 * at "।", "?" or "!") when it is a real sentence that fits; otherwise the summary clipped at a word.
 */
export function firstSentence(text: string, max = 155): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[।?!])(?:\s|$)/);
  if (m && m[1].length >= 25 && m[1].length <= max) return m[1];
  return clip(t, max);
}

/** The city from an English address: "Sher-e-Bangla Nagar, Dhaka, Dhaka Division, Bangladesh" → "Dhaka". */
function cityOf(locality?: string): string | undefined {
  const parts = (locality ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !/\b(division|district|bangladesh|upazila|country)\b/i.test(p));
  return parts.at(-1);
}

export function curatedSeo(p: Place): PlaceSeo {
  const hero = p.hero ? p.images[p.hero.image]?.src : undefined;
  const built = p.built.end && p.built.end !== p.built.start ? `${bnYear(p.built.start)}–${bnYear(p.built.end)}` : bnYear(p.built.start);
  return {
    slug: p.slug,
    name: p.name.bn,
    alternateNames: [p.name.en].filter((n): n is string => !!n && n !== p.name.bn),
    hook: `${ERA_META[p.era].bn} আমল · ${built}`,
    description: firstSentence(p.summary.bn),
    line: `${ERA_META[p.era].bn} আমল · ${built}`,
    photo: hero,
    lat: p.location.lat,
    lng: p.location.lng,
    city: p.city.en,
    building: true,
    indexable: p.status === "published",
  };
}

export function storySeo(s: PlacePage, videos: PlaceVideo[]): PlaceSeo {
  const st = s.story;
  const name = st.name_bn || s.name_bn;
  const alt = [st.name_en, ...(st.historical_names ?? []).map((h) => h.name)].filter((n): n is string => !!n && n !== name);
  return {
    slug: s.slug,
    name,
    alternateNames: [...new Set(alt)],
    hook: [st.kind_bn, st.origin_bn?.split(/[(/,;]/)[0].trim()].filter(Boolean).join(" · ") || undefined,
    description: firstSentence(st.summary_bn ?? ""),
    line: [st.era_label_bn, st.origin_bn].filter(Boolean).join(" · ") || st.kind_bn || undefined,
    photo: s.image?.src,
    lat: s.lat,
    lng: s.lng,
    city: cityOf(st.locality_en),
    building: BUILDING.test(`${st.kind_bn ?? ""} ${name}`),
    video: videos.find((v) => v.provider === "youtube"),
    updated: s.updated_at,
    // Only the places pinned on the public map are on search engines; the rest stay shareable.
    indexable: s.show_on_map,
  };
}

/**
 * "<name> — <hook> | Place & Past", kept near 60 characters: the hook's parts ("সংসদ ভবন · ১৯৮২") are
 * dropped from the end until it fits, never cut mid-word.
 */
export function seoTitle(p: PlaceSeo): string {
  const tail = ` | ${SITE.name}`;
  const parts = (p.hook ?? "").split(" · ").filter(Boolean);
  for (let n = parts.length; n > 0; n--) {
    const t = `${p.name} — ${parts.slice(0, n).join(" · ")}${tail}`;
    if (t.length <= 60) return t;
  }
  return `${p.name}${tail}`;
}

export const pageUrl = (slug: string) => `${SITE.url}/place/${slug}`;

/** The YouTube thumbnail of the place's video: the full-size one when the video has it. */
export async function youtubeThumb(id: string): Promise<{ url: string; width: number; height: number }> {
  const max = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  try {
    const r = await fetch(max, { method: "HEAD", signal: AbortSignal.timeout(3000) });
    if (r.ok) return { url: max, width: 1280, height: 720 };
  } catch {
    // fall through to the always-present one
  }
  return { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 };
}

/** The share image: the video's thumbnail when the place has a video, else its generated card. */
export async function shareImage(p: PlaceSeo): Promise<{ url: string; width: number; height: number }> {
  if (p.video) return youtubeThumb(p.video.providerVideoId);
  return { url: `${SITE.url}/og/place/${p.slug}`, width: 1200, height: 630 };
}

const absolute = (src: string) => (src.startsWith("/") ? `${SITE.url}${src}` : src);

/** "PT3M28S" from 208 seconds. */
export function isoDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

/** The structured data (schema.org) for a place page: the place, and its video when it has one. */
export function placeJsonLd(p: PlaceSeo, image: { url: string }): object[] {
  const url = pageUrl(p.slug);
  const images = [...new Set([p.photo && absolute(p.photo), image.url].filter((x): x is string => !!x))];
  const place = {
    "@context": "https://schema.org",
    "@type": p.building ? ["TouristAttraction", "LandmarksOrHistoricalBuildings"] : "TouristAttraction",
    "@id": `${url}#place`,
    name: p.name,
    ...(p.alternateNames.length ? { alternateName: p.alternateNames } : {}),
    description: p.description,
    url,
    image: images,
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    address: { "@type": "PostalAddress", ...(p.city ? { addressLocality: p.city } : {}), addressCountry: "BD" },
    inLanguage: "bn",
  };
  const v = p.video;
  if (!v) return [place];
  const video = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.title,
    description: p.description || v.title,
    thumbnailUrl: [image.url, `https://i.ytimg.com/vi/${v.providerVideoId}/hqdefault.jpg`].filter((x, i, a) => a.indexOf(x) === i),
    ...(v.publishedAt ? { uploadDate: v.publishedAt } : {}),
    embedUrl: `https://www.youtube.com/embed/${v.providerVideoId}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.providerVideoId}`,
    ...(v.durationSeconds ? { duration: isoDuration(v.durationSeconds) } : {}),
    about: { "@id": `${url}#place` },
  };
  return [place, video];
}

/** JSON for a <script type="application/ld+json">: "<" escaped so text can't close the tag. */
export const jsonLdText = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
