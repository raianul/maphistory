import { requireAdmin } from "@/lib/admin-auth";
import { invalidatePublicEvents } from "@/lib/events/cache";
import { addDate, getEvent, touchEvent, withProblems } from "@/lib/events/db";
import { isId, notFound } from "@/lib/events/route-helpers";
import { DateFields, stepOnDate } from "@/lib/events/schema";

/**
 * Add an "On this day" date to a story: { year, month, day, title, summary?, step_id? }. Without a
 * step_id, the step whose exact date matches is used (if any). New dates are drafts: they go live
 * when approved (PATCH { status: "published" }) or when the story is published.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/events/[id]/dates">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isId(id)) return notFound();
  const parsed = DateFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid date", issues: parsed.error.issues }, { status: 400 });
  try {
    const found = await getEvent(id);
    if (!found) return notFound();
    const step_id = parsed.data.step_id ?? stepOnDate(found.steps, parsed.data);
    if (step_id && !found.steps.some((s) => s.id === step_id)) return Response.json({ error: "That step isn't part of this story" }, { status: 400 });
    await addDate(id, { ...parsed.data, step_id }, admin.userId);
    await touchEvent(id, admin.userId);
    if (found.event.status === "published") invalidatePublicEvents();
    return Response.json(withProblems((await getEvent(id))!), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
