import { NextResponse, type NextRequest } from "next/server";
import { isPlacePage, newVisitorToken, readReactions, setReaction, VISITOR_COOKIE, visitorKey, type Reaction } from "@/lib/reactions";
import { isPlaceSlug } from "@/lib/slug";

/*
 * 👍 / 👎 on a place page.
 *   GET  → { likes, mine }            (dislike counts are never sent to visitors)
 *   POST { value: 1 | -1 | 0 } → the same, after the vote (0 takes it back)
 * A visitor is a random id in a cookie (set on the first vote), stored only hashed.
 */

const noStore = { "Cache-Control": "no-store" };
const YEAR = 60 * 60 * 24 * 365;

export async function GET(req: NextRequest, { params }: RouteContext<"/api/reactions/[slug]">) {
  const { slug } = await params;
  if (!isPlaceSlug(slug)) return Response.json({ error: "Not found" }, { status: 404 });
  const token = req.cookies.get(VISITOR_COOKIE)?.value;
  try {
    return Response.json(await readReactions(slug, token ? visitorKey(token) : undefined), { headers: noStore });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Unavailable" }, { status: 503, headers: noStore });
  }
}

export async function POST(req: NextRequest, { params }: RouteContext<"/api/reactions/[slug]">) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
  const value = body?.value;
  if (!isPlaceSlug(slug) || (value !== 1 && value !== -1 && value !== 0)) {
    return Response.json({ error: "Bad request" }, { status: 400, headers: noStore });
  }
  const existing = req.cookies.get(VISITOR_COOKIE)?.value;
  const token = existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : newVisitorToken();
  try {
    if (!(await isPlacePage(slug))) return Response.json({ error: "Not found" }, { status: 404, headers: noStore });
    const visitor = visitorKey(token);
    await setReaction(slug, visitor, value as Reaction);
    const res = NextResponse.json(await readReactions(slug, visitor), { headers: noStore });
    if (token !== existing) {
      res.cookies.set(VISITOR_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: YEAR });
    }
    return res;
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Unavailable" }, { status: 503, headers: noStore });
  }
}
