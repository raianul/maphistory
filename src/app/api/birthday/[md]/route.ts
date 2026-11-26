import { birthdayDay, BusyError, parseMonthDay } from "@/lib/birthday";

// A day not searched yet: Gemini with Google Search, then a check of every source page.
export const maxDuration = 120;

/**
 * The events of one day and month for the birthday card: /api/birthday/12-16 → { month, day,
 * events }. A day nobody has asked for yet is searched once and saved for everyone.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/birthday/[md]">) {
  const { md } = await params;
  const date = parseMonthDay(md);
  if (!date) return Response.json({ error: "তারিখটি ঠিক নেই" }, { status: 400 });
  try {
    const result = await birthdayDay(date.month, date.day, { search: true });
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (e) {
    if (e instanceof BusyError) {
      return Response.json({ error: "এই মুহূর্তে অনেকে খুঁজছেন। একটু পরে আবার চেষ্টা করুন।" }, { status: 429, headers: { "Cache-Control": "no-store" } });
    }
    console.error("birthday:", e);
    return Response.json({ error: "এখন খোঁজা গেল না। একটু পরে আবার চেষ্টা করুন।" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
