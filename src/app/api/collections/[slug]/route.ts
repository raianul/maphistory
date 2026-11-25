import { publishedCollection } from "@/lib/collections";
import { inRegion } from "@/lib/region";

/** One published collection with its places (as map pins, in order). */
export async function GET(_req: Request, { params }: RouteContext<"/api/collections/[slug]">) {
  const { slug } = await params;
  try {
    const c = await publishedCollection(slug);
    if (!c) return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
    return Response.json(
      { collection: { ...c, places: c.places.filter((p) => inRegion(p.lat, p.lng)) } },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "This collection is unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
