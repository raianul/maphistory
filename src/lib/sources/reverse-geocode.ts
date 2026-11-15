/**
 * Where on Earth a clicked point is: country (ISO code), region, city and
 * district, from Photon's reverse geocoder (OpenStreetMap, no key). It gives
 * the AI real location context instead of a guess, and decides the story's
 * country. Server-side only.
 */
import { WIKI_HEADERS } from "./wiki";

export type PlaceContext = {
  /** ISO 3166-1 alpha-2, e.g. "BD", "IT", "RU". */
  countryCode?: string;
  country?: string;
  /** State, province or division. */
  region?: string;
  city?: string;
  district?: string;
};

const cache = new Map<string, PlaceContext | undefined>();

/** The context for a point, or undefined if the lookup fails or is slow (never blocks a story for long). */
export async function reverseGeocode(lat: number, lng: number, timeoutMs = 2500): Promise<PlaceContext | undefined> {
  // ~100 m grid: nearby clicks share one lookup.
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: "en", limit: "1" });
    const res = await fetch(`https://photon.komoot.io/reverse?${params}`, {
      headers: WIKI_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { features?: { properties: Record<string, string | undefined> }[] };
    const p = data.features?.[0]?.properties;
    // The feature's own "name" is just the nearest object (a statue, a shop): deliberately unused.
    const context: PlaceContext | undefined = p
      ? {
          countryCode: p.countrycode?.toUpperCase(),
          country: p.country,
          region: p.state,
          city: p.city ?? p.county,
          district: p.district,
        }
      : undefined;
    if (cache.size > 5000) cache.clear();
    cache.set(key, context);
    return context;
  } catch {
    return undefined;
  }
}

/** "Manhattan, New York, New York, United States (US)" for the prompt. */
export function describeContext(c: PlaceContext | undefined): string | undefined {
  if (!c) return undefined;
  const parts = [c.district, c.city, c.region, c.country].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  if (!parts.length) return undefined;
  return parts.join(", ") + (c.countryCode ? ` (country code ${c.countryCode})` : "");
}
