import { NextResponse, type NextRequest } from "next/server";
import { ensureSlug, findStory } from "@/lib/db";

/**
 * Old place links (/?place=<name>&at=<lat>,<lng>[&kind=…]) move permanently (308) to the place's
 * own page, /place/<slug>, keeping campaign tags (utm_*). A link to a place with no saved story yet
 * (or if the lookup fails) is left alone: the map opens it as before. Runs only for such links.
 */
export async function proxy(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const name = p.get("place")?.trim();
  const at = p.get("at")?.split(",").map(Number);
  if (!name || at?.length !== 2 || !at.every(Number.isFinite)) return NextResponse.next();
  try {
    const story = await findStory({ name, lat: at[0], lng: at[1], kind: p.get("kind") ?? undefined });
    if (!story || story.status === "hidden") return NextResponse.next();
    const slug = story.slug ?? (await ensureSlug(story.id));
    const to = new URL(`/place/${slug}`, req.url);
    for (const [k, v] of p) if (/^utm_/i.test(k)) to.searchParams.set(k, v);
    return NextResponse.redirect(to, 308);
  } catch (e) {
    console.error("old place link:", e);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [{ source: "/", has: [{ type: "query", key: "place" }, { type: "query", key: "at" }] }],
};
