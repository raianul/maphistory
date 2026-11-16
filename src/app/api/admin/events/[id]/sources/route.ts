import { requireAdmin } from "@/lib/admin-auth";
import { invalidatePublicEvents } from "@/lib/events/cache";
import { addSource, getEvent, touchEvent, withProblems } from "@/lib/events/db";
import { SourceFields } from "@/lib/events/schema";

/** Add a source to an event (added by an editor). */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/events/[id]/sources">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const parsed = SourceFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "সূত্রের তথ্য ঠিক নেই", issues: parsed.error.issues }, { status: 400 });
  try {
    const found = await getEvent(id);
    if (!found) return Response.json({ error: "পাওয়া যায়নি" }, { status: 404 });
    await addSource(id, parsed.data, admin.userId);
    await touchEvent(id, admin.userId);
    if (found.event.status === "published") invalidatePublicEvents();
    const fresh = (await getEvent(id))!;
    return Response.json(withProblems(fresh), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
