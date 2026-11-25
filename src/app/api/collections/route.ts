import { publishedCollections } from "@/lib/collections";

/** The published collections, for the map's সংগ্রহ list. Cached briefly (an edit shows within a minute). */
export async function GET() {
  try {
    return Response.json(
      { collections: await publishedCollections() },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Collections are unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
