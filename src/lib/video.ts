/**
 * Videos about places: one record type for every provider, and a small
 * provider registry (YouTube for now) for parsing links and embedding.
 * Client-safe: no server imports.
 */

export type VideoProvider = "youtube";

/** A video as stored in `place_videos` and sent to the panel. */
export type PlaceVideo = {
  id: string;
  provider: VideoProvider;
  providerVideoId: string;
  url: string;
  title: string;
  language: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  publishedAt?: string;
};

type ProviderSpec = {
  /** The provider's id for a link, or undefined if the link isn't one of its videos. */
  parse(url: URL): string | undefined;
  canonicalUrl(id: string): string;
  /** Player URL, loaded only after the viewer presses play. */
  embedUrl(id: string): string;
  /** A thumbnail that needs no API call. */
  thumbnailUrl(id: string): string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export const PROVIDERS: Record<VideoProvider, ProviderSpec> = {
  youtube: {
    parse(url) {
      const host = url.hostname.replace(/^www\.|^m\./, "");
      let id: string | null | undefined;
      if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
      else if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
        if (url.pathname === "/watch") id = url.searchParams.get("v");
        else id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1];
      }
      return id && YOUTUBE_ID.test(id) ? id : undefined;
    },
    canonicalUrl: (id) => `https://www.youtube.com/watch?v=${id}`,
    // Privacy-enhanced mode; autoplay only applies after the viewer's own click (see VideoPlayer).
    embedUrl: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    thumbnailUrl: (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  },
};

/** Which provider and video a pasted link points to, or undefined for anything unsupported. */
export function parseVideoUrl(input: string): { provider: VideoProvider; providerVideoId: string; url: string } | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  for (const [provider, spec] of Object.entries(PROVIDERS) as [VideoProvider, ProviderSpec][]) {
    const id = spec.parse(url);
    if (id) return { provider, providerVideoId: id, url: spec.canonicalUrl(id) };
  }
  return undefined;
}

const bnDigits = new Intl.NumberFormat("bn-BD", { useGrouping: false, minimumIntegerDigits: 1 });
const two = (n: number) => bnDigits.format(Math.floor(n / 10)) + bnDigits.format(n % 10);

/** 754 → "১২:৩৪", 3725 → "১:০২:০৫". */
export function formatDuration(seconds: number | undefined): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${bnDigits.format(h)}:${two(m)}:${two(s)}` : `${bnDigits.format(m)}:${two(s)}`;
}

/** "12:34" or "1:02:05" (Latin or Bangla digits) → seconds; undefined if not a duration. */
export function parseDuration(text: string): number | undefined {
  const latin = text.trim().replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(latin)) return undefined;
  const parts = latin.split(":").map(Number);
  if (parts.slice(1).some((p) => p > 59)) return undefined;
  const total = parts.reduce((acc, p) => acc * 60 + p, 0);
  return total > 0 ? total : undefined;
}
