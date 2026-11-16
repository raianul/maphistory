import { requireAdmin } from "@/lib/admin-auth";
import { deleteStep, updateStep } from "@/lib/events/db";
import { applyChange, badRequest, isId, notFound } from "@/lib/events/route-helpers";
import { StepFields, type TimelineStep } from "@/lib/events/schema";

type Ctx = RouteContext<"/api/admin/events/[id]/steps/[stepId]">;

/** Edit a step (its fields and which sources back it). Its place in the order is kept. */
export async function PUT(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, stepId } = await params;
  if (!isId(stepId)) return notFound();
  const parsed = StepFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "ধাপের তথ্য ঠিক নেই", parsed.error.issues);
  return applyChange(
    id,
    async (cur) => {
      if (!cur.steps.some((s) => s.id === stepId)) throw new Error("ধাপটি পাওয়া যায়নি");
      const own = new Set(cur.sources.map((s) => s.id));
      if (parsed.data.source_ids.some((s) => !own.has(s))) throw new Error("এই ঘটনার নয় এমন সূত্র যুক্ত করা যায় না");
      await updateStep(id, stepId, parsed.data, admin.userId);
    },
    (cur) => ({ ...cur, steps: cur.steps.map((s) => (s.id === stepId ? ({ ...s, ...parsed.data } as TimelineStep) : s)) }),
  );
}

/** Delete a step; the others close up (positions stay 0..n-1). */
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, stepId } = await params;
  if (!isId(stepId)) return notFound();
  return applyChange(
    id,
    async (cur) => {
      if (!cur.steps.some((s) => s.id === stepId)) throw new Error("ধাপটি পাওয়া যায়নি");
      await deleteStep(id, stepId);
    },
    (cur) => ({ ...cur, steps: cur.steps.filter((s) => s.id !== stepId) }),
  );
}
