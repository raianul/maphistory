import { siteSearch } from "@/lib/site-search";

/** ?q=… → { hits }: the site's own places and events matching the search (see lib/site-search). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ hits: await siteSearch(q) }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (e) {
    console.error("site search:", e);
    return Response.json({ hits: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
