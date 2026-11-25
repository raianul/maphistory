/**
 * Place search by name (OpenStreetMap): Photon, or Nominatim when Photon is down, limited to the
 * map's region. Coordinates come from OpenStreetMap, not guesses. Server-side only.
 */
import { BANGLADESH_ONLY, BD_BOUNDS, inRegion } from "./region";
import { WIKI_HEADERS } from "./sources/wiki";

export type GeoResult = { name: string; context: string; lat: number; lng: number; kind: string };

/** Photon (OpenStreetMap, fast; its free server is sometimes unreachable). */
async function photon(q: string): Promise<GeoResult[]> {
  const params = new URLSearchParams({ q, limit: "10" });
  if (BANGLADESH_ONLY) params.set("bbox", BD_BOUNDS.flat().join(","));
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  type F = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
  const data = (await res.json()) as { features?: F[] };
  return (data.features ?? []).map((f) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    return { name: p.name ?? "", context: [p.district ?? p.city ?? p.county, p.state].filter(Boolean).join(", "), lat, lng, kind: `${p.osm_key}=${p.osm_value}` };
  });
}

/** Nominatim (OpenStreetMap's own search): the fallback. One request per person searching, so its 1/s policy holds. */
async function nominatim(q: string): Promise<GeoResult[]> {
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "10", addressdetails: "1", "accept-language": "bn,en" });
  if (BANGLADESH_ONLY) params.set("countrycodes", "bd");
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  type H = { lat: string; lon: string; name?: string; display_name: string; category?: string; type?: string; address?: Record<string, string> };
  return ((await res.json()) as H[]).map((h) => {
    const a = h.address ?? {};
    return {
      name: h.name || h.display_name.split(",")[0],
      context: [a.city_district ?? a.suburb ?? a.city ?? a.town ?? a.county, a.state_district ?? a.state].filter(Boolean).join(", "),
      lat: Number(h.lat),
      lng: Number(h.lon),
      kind: `${h.category}=${h.type}`,
    };
  });
}

/** Places matching `q` inside the map's region; null when both services are down. */
export async function searchPlaces(q: string): Promise<GeoResult[] | null> {
  let found: GeoResult[] | null = null;
  for (const search of [photon, nominatim]) {
    try {
      found = await search(q);
      if (found.length) break;
    } catch {
      // this service is down or slow: try the next
    }
  }
  return found === null ? null : found.filter((r) => r.name && inRegion(r.lat, r.lng));
}
