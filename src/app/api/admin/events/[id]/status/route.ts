import { requireAdmin } from "@/lib/admin-auth";
import { invalidatePublicEvents } from "@/lib/events/cache";
import { getEvent, publishDates, setEventStatus, verifyAll, withProblems } from "@/lib/events/db";
import { canMove, EVENT_STATUSES, publishProblems, STATUS_EN, type EventStatus } from "@/lib/events/schema";

/**
 * Move an event through draft → research → review → published → archived: { to: "<status>" }.
 * Only the allowed moves; publishing only when the checklist passes, and it marks the event's
 * sources and steps verified by this admin (publishing is the verification). Anything that changes what
 * visitors can see clears the public cache at once (so unpublishing takes effect immediately).
 */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/events/[id]/status">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { to?: unknown } | null;
  const to = body?.to;
  if (typeof to !== "string" || !(EVENT_STATUSES as readonly string[]).includes(to)) {
    return Response.json({ error: "Unknown status" }, { status: 400 });
  }
  try {
    const found = await getEvent(id);
    if (!found) return Response.json({ error: "Not found" }, { status: 404 });
    const from = found.event.status;
    if (!canMove(from, to as EventStatus)) {
      return Response.json({ error: `Can't move directly from "${STATUS_EN[from]}" to "${STATUS_EN[to as EventStatus]}"` }, { status: 409 });
    }
    if (to === "published") {
      const problems = publishProblems(found.event, found.sources, found.steps);
      if (problems.length) return Response.json({ error: "Fix these before publishing", problems }, { status: 409 });
    }
    // Publishing is the admin's verification of everything in the event (sources and steps).
    if (to === "published") {
      await verifyAll(id, admin.userId);
      await publishDates(id);
    }
    const event = await setEventStatus(found.event, to as EventStatus, admin.userId);
    if (from === "published" || to === "published") invalidatePublicEvents();
    const fresh = to === "published" ? await getEvent(id) : undefined;
    return Response.json(withProblems({ ...(fresh ?? found), event }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
