/**
 * Real metadata for a pasted video link, from the provider's public oEmbed
 * endpoint (no API key): the published title and thumbnail. It also proves the
 * video exists and can be embedded: removed, private or invalid videos fail
 * here. oEmbed has no duration, so that stays empty unless an editor enters it.
 * Server-side only.
 */
import { PROVIDERS, type VideoProvider } from "../video";

export type OEmbedInfo = { title: string; thumbnailUrl?: string; author?: string };

const ENDPOINTS: Record<VideoProvider, string> = {
  youtube: "https://www.youtube.com/oembed",
};

export async function fetchVideoInfo(provider: VideoProvider, providerVideoId: string): Promise<OEmbedInfo | undefined> {
  const url = `${ENDPOINTS[provider]}?${new URLSearchParams({ format: "json", url: PROVIDERS[provider].canonicalUrl(providerVideoId) })}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { title?: string; thumbnail_url?: string; author_name?: string };
    if (!data.title) return undefined;
    return { title: data.title, thumbnailUrl: data.thumbnail_url, author: data.author_name };
  } catch {
    return undefined;
  }
}

/**
 * A YouTube video's upload date and length, from its public page (oEmbed has neither). Used for
 * search engines' video results (schema.org VideoObject needs the upload date). Undefined when the
 * page can't be read; never throws.
 */
export async function fetchYouTubeDetails(id: string): Promise<{ publishedAt?: string; durationSeconds?: number } | undefined> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, {
      headers: { "Accept-Language": "en", "User-Agent": "Mozilla/5.0 (compatible; PlaceAndPast/0.1)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const date = /itemprop="uploadDate" content="([^"]+)"/.exec(html)?.[1] ?? /"uploadDate":"([^"]+)"/.exec(html)?.[1];
    const secs = Number(/"lengthSeconds":"(\d+)"/.exec(html)?.[1]);
    const out = { ...(date && !Number.isNaN(Date.parse(date)) ? { publishedAt: new Date(date).toISOString() } : {}), ...(secs > 0 ? { durationSeconds: secs } : {}) };
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}
