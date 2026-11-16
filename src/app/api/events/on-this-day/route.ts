import { eventsOnDay } from "@/lib/events/public";
import { todayInDhaka } from "@/lib/events/schema";

/**
 * "On this day" for the public map: ?date=MM-DD (default: today in Bangladesh, Asia/Dhaka).
 * Published events for that day, or, when there are none, those of the next day that has some.
 * Served from the server cache (cleared at once when an admin unpublishes or edits an event);
 * browsers and the CDN keep it for at most a minute.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const today = todayInDhaka();
  let month = today.month;
  let day = today.day;
  const asked = p.get("date");
  if (asked) {
    const m = /^(\d{2})-(\d{2})$/.exec(asked);
    const mm = m ? Number(m[1]) : NaN;
    const dd = m ? Number(m[2]) : NaN;
    // A real day of the year (29 February included).
    if (!m || mm < 1 || mm > 12 || dd < 1 || dd > new Date(Date.UTC(2000, mm, 0)).getUTCDate()) {
      return Response.json({ error: "date must be MM-DD" }, { status: 400 });
    }
    month = mm;
    day = dd;
  }
  try {
    const result = await eventsOnDay(month, day, today.year);
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "ঘটনা আনা যায়নি" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
