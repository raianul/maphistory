import { requireAdmin } from "@/lib/admin-auth";
import { invalidatePublicEvents } from "@/lib/events/cache";
import { deleteEvent, getEvent, updateEvent, withProblems } from "@/lib/events/db";
import { EventFields, publishProblems } from "@/lib/events/schema";

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** One event with its sources, and what still stands in the way of publishing it. */
export async function GET(req: Request, { params }: RouteContext<"/api/admin/events/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const found = await getEvent(id);
    if (!found) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(withProblems(found));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Save the event's fields (status has its own route). */
export async function PUT(req: Request, { params }: RouteContext<"/api/admin/events/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = EventFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid data", issues: parsed.error.issues }, { status: 400 });
  try {
    const current = await getEvent(id);
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });
    // A published event must stay publishable: an edit that breaks the checklist is refused.
    if (current.event.status === "published") {
      const problems = publishProblems({ ...current.event, ...parsed.data }, current.sources, current.steps);
      if (problems.length) {
        return Response.json({ error: "This change isn't allowed on a published event; unpublish it first", problems }, { status: 409 });
      }
    }
    const event = await updateEvent(id, parsed.data, admin.userId);
    // A published event's text changed: visitors must see the new version, not a cached one.
    if (event.status === "published") invalidatePublicEvents();
    return Response.json(withProblems({ ...current, event }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Delete: only drafts and archived events (published ones are archived instead, never vanish). */
export async function DELETE(req: Request, { params }: RouteContext<"/api/admin/events/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const current = await getEvent(id);
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });
    if (!["draft", "archived"].includes(current.event.status)) {
      return Response.json({ error: "Only draft or archived events can be deleted. Archive it first." }, { status: 409 });
    }
    await deleteEvent(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
