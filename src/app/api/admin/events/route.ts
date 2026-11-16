import { requireAdmin } from "@/lib/admin-auth";
import { createEvent, listEvents, type EventListFilters } from "@/lib/events/db";
import { EVENT_STATUSES, EventFields, type EventStatus } from "@/lib/events/schema";

/** Admin list: ?q=&status=&month=&day=&country= */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const p = new URL(req.url).searchParams;
  const num = (k: string) => (p.get(k) && /^\d{1,2}$/.test(p.get(k)!) ? Number(p.get(k)) : undefined);
  const status = p.get("status");
  const filters: EventListFilters = {
    q: p.get("q") ?? undefined,
    status: status && (EVENT_STATUSES as readonly string[]).includes(status) ? (status as EventStatus) : undefined,
    month: num("month"),
    day: num("day"),
    country: /^[A-Za-z]{2}$/.test(p.get("country") ?? "") ? p.get("country")! : undefined,
  };
  try {
    return Response.json({ events: await listEvents(filters) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Create an event (always as a draft). */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = EventFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid data", issues: parsed.error.issues }, { status: 400 });
  try {
    return Response.json({ event: await createEvent(parsed.data, admin.userId) }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
