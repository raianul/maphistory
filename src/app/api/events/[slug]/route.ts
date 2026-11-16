import { publicEvent } from "@/lib/events/public";

/** One published event (with its sources and timeline) for the public map. */
export async function GET(_req: Request, { params }: RouteContext<"/api/events/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return Response.json({ error: "পাওয়া যায়নি" }, { status: 404 });
  try {
    const event = await publicEvent(slug);
    // Not published (or unpublished since): gone, and not cached anywhere.
    if (!event) return Response.json({ error: "এই ঘটনাটি এখন দেখানো হচ্ছে না" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({ event }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "ঘটনা আনা যায়নি" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
