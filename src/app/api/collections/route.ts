import { publishedPage } from "@/lib/collections";

/** How many collections one page of the সংগ্রহ panel shows. */
const PER_PAGE = 5;

/**
 * The published collections, a page at a time, for the map's সংগ্রহ panel: ?page=1 →
 * { collections, total, page, pages }. Cached briefly (an edit shows within a minute).
 */
export async function GET(req: Request) {
  const page = Math.max(1, Math.min(1000, Number(new URL(req.url).searchParams.get("page")) || 1));
  try {
    const { collections, total } = await publishedPage((page - 1) * PER_PAGE, PER_PAGE);
    return Response.json(
      { collections, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Collections are unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
