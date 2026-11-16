import { requireAdmin } from "@/lib/admin-auth";
import { BANGLADESH_ONLY, BD_BOUNDS, inRegion } from "@/lib/region";
import { WIKI_HEADERS } from "@/lib/sources/wiki";

/**
 * Place search for the admin's map picker: ?q=…  → [{ name, context, lat, lng }]. Photon
 * (OpenStreetMap), limited to the map's region. Coordinates come from OpenStreetMap, not guesses.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 120);
  if (!q || q.length < 2) return Response.json({ results: [] });
  const params = new URLSearchParams({ q, limit: "10" });
  if (BANGLADESH_ONLY) params.set("bbox", BD_BOUNDS.flat().join(","));
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    type F = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };
    const data = (await res.json()) as { features?: F[] };
    const results = (data.features ?? [])
      .map((f) => {
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        return { name: p.name ?? "", context: [p.district ?? p.city ?? p.county, p.state].filter(Boolean).join(", "), lat, lng, kind: `${p.osm_key}=${p.osm_value}` };
      })
      .filter((r) => r.name && inRegion(r.lat, r.lng));
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: (e as Error).message, results: [] }, { status: 502 });
  }
}
