import { pinAreas } from "@/lib/pin-areas";

/** Numbered circles for the zoomed-out map: { coarse, fine } lists of { lat, lng, n }. */
export async function GET() {
  try {
    return Response.json(await pinAreas(), { headers: { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=86400" } });
  } catch (e) {
    console.error(e);
    return Response.json({ coarse: [], fine: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
