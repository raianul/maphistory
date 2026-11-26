import { birthdayDay, parseMonthDay } from "@/lib/birthday";
import { birthdayCard } from "@/lib/og/birthday-card";

/**
 * The birthday card image: /og/birthday/12-16 (link preview, 1200×630) or ?format=story
 * (1080×1920, to download). Uses the saved day only (a day not searched yet: the card without events).
 */
export async function GET(req: Request, { params }: RouteContext<"/og/birthday/[md]">) {
  const { md } = await params;
  const date = parseMonthDay(md.replace(/\.(png|jpg)$/, ""));
  if (!date) return new Response("Not found", { status: 404 });
  const saved = await birthdayDay(date.month, date.day, { search: false }).catch(() => null);
  const format = new URL(req.url).searchParams.get("format") === "story" ? "story" : "link";
  return birthdayCard({ ...date, events: saved?.events ?? [], format });
}
