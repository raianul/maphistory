import { requireAdmin } from "@/lib/admin-auth";
import { monthCoverage } from "@/lib/events/db";

/** The admin's calendar: ?month=11&year=2026 → per day, live and draft anniversaries. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const p = new URL(req.url).searchParams;
  const month = Number(p.get("month"));
  const year = Number(p.get("year"));
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 2200) {
    return Response.json({ error: "month=1–12 and year are required" }, { status: 400 });
  }
  try {
    return Response.json({ month, year, days: await monthCoverage(month, year) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
