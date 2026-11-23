import { requireAdmin } from "@/lib/admin-auth";
import { invalidatePublicEvents } from "@/lib/events/cache";
import { deleteDate, getEvent, touchEvent, updateDate, withProblems } from "@/lib/events/db";
import { isId, notFound } from "@/lib/events/route-helpers";
import { DATE_STATUSES, DateFields } from "@/lib/events/schema";
import { z } from "zod";

type Ctx = RouteContext<"/api/admin/events/[id]/dates/[dateId]">;

const Patch = z.union([z.object({ status: z.enum(DATE_STATUSES) }).strict(), DateFields]);

/** Edit a date ({ year, month, day, title, summary?, step_id? }) or approve/withdraw it ({ status }). */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, dateId } = await params;
  if (!isId(id) || !isId(dateId)) return notFound();
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid date", issues: parsed.error.issues }, { status: 400 });
  try {
    const found = await getEvent(id);
    if (!found) return notFound();
    const body = parsed.data;
    if ("step_id" in body && body.step_id && !found.steps.some((s) => s.id === body.step_id)) {
      return Response.json({ error: "That step isn't part of this story" }, { status: 400 });
    }
    await updateDate(id, dateId, "status" in body && !("title" in body) ? { status: body.status } : { ...(body as z.infer<typeof DateFields>), step_id: (body as z.infer<typeof DateFields>).step_id ?? null });
    await touchEvent(id, admin.userId);
    if (found.event.status === "published") invalidatePublicEvents();
    return Response.json(withProblems((await getEvent(id))!));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, dateId } = await params;
  if (!isId(id) || !isId(dateId)) return notFound();
  try {
    const found = await getEvent(id);
    if (!found) return notFound();
    await deleteDate(id, dateId);
    await touchEvent(id, admin.userId);
    if (found.event.status === "published") invalidatePublicEvents();
    return Response.json(withProblems((await getEvent(id))!));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
