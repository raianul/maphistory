import { findStoryBySlug, listVideos } from "@/lib/db";
import { getPlace } from "@/lib/places";
import { isPlaceSlug } from "@/lib/slug";

/**
 * A place by its page address, for the map (Back/Forward to /place/<slug>):
 *   { curated: true }                          a hand-written place (its own panel route)
 *   { target: {name,lat,lng,kind,slug}, place } a saved AI story
 * Hidden or unknown places: 404.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/place/[slug]">) {
  const { slug } = await params;
  if (!isPlaceSlug(slug)) return Response.json({ error: "Not found" }, { status: 404 });
  if (getPlace(slug)) return Response.json({ curated: true });
  try {
    const p = await findStoryBySlug(slug);
    if (!p) return Response.json({ error: "Not found" }, { status: 404 });
    const videos = await listVideos(p.id);
    return Response.json(
      {
        target: { name: p.name_bn, lat: p.lat, lng: p.lng, kind: p.kind ?? undefined, slug: p.slug },
        place: { id: p.id, slug: p.slug, story: p.story, image: p.image, model: p.model, status: p.status, verifiedAt: p.verifiedAt, ...(videos.length ? { videos } : {}) },
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }
}
