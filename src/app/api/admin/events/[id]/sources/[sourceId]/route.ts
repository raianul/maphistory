import { requireAdmin } from "@/lib/admin-auth";
import { invalidatePublicEvents } from "@/lib/events/cache";
import { deleteSource, getEvent, touchEvent, updateSource, withProblems } from "@/lib/events/db";
import { SourceFields } from "@/lib/events/schema";

type Ctx = RouteContext<"/api/admin/events/[id]/sources/[sourceId]">;

/** Edit a source (including marking it verified). */
export async function PUT(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, sourceId } = await params;
  const parsed = SourceFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "সূত্রের তথ্য ঠিক নেই", issues: parsed.error.issues }, { status: 400 });
  try {
    const found = await getEvent(id);
    if (!found) return Response.json({ error: "পাওয়া যায়নি" }, { status: 404 });
    await updateSource(id, sourceId, parsed.data);
    await touchEvent(id, admin.userId);
    if (found.event.status === "published") invalidatePublicEvents();
    const fresh = (await getEvent(id))!;
    return Response.json(withProblems(fresh));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Remove a source. A published event keeps at least one verified source. */
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, sourceId } = await params;
  try {
    const found = await getEvent(id);
    if (!found) return Response.json({ error: "পাওয়া যায়নি" }, { status: 404 });
    // A verified step must keep at least one source: removing its last one would leave it unbacked.
    const stranded = found.steps.findIndex((st) => st.verified && st.source_ids.length === 1 && st.source_ids[0] === sourceId);
    if (stranded >= 0) {
      return Response.json(
        { error: `ধাপ ${(stranded + 1).toLocaleString("bn-BD")} শুধু এই সূত্রের ওপর নির্ভর করে। আগে ধাপটিতে অন্য সূত্র যোগ করুন বা যাচাই চিহ্ন তুলে নিন।` },
        { status: 409 },
      );
    }
    if (found.event.status === "published") {
      const left = found.sources.filter((s) => s.id !== sourceId);
      if (!left.some((s) => s.verified)) {
        return Response.json({ error: "প্রকাশিত ঘটনার শেষ যাচাই করা সূত্র মোছা যায় না। আগে অপ্রকাশিত করুন বা আরেকটি সূত্র যোগ করুন।" }, { status: 409 });
      }
    }
    await deleteSource(id, sourceId);
    await touchEvent(id, admin.userId);
    if (found.event.status === "published") invalidatePublicEvents();
    const fresh = (await getEvent(id))!;
    return Response.json(withProblems(fresh));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
