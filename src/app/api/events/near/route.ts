import { eventsNear } from "@/lib/events/public";
import { inRegion } from "@/lib/region";

/** ?lat=&lng= → { events }: published events at or through that spot (the place panel's "এখানে যা ঘটেছিল"). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inRegion(lat, lng)) return Response.json({ events: [] });
  try {
    return Response.json({ events: await eventsNear(lat, lng) }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400" } });
  } catch (e) {
    console.error("events near:", e);
    return Response.json({ events: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
