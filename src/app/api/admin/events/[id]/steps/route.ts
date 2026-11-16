import { requireAdmin } from "@/lib/admin-auth";
import { addStep } from "@/lib/events/db";
import { applyChange, badRequest } from "@/lib/events/route-helpers";
import { StepFields, type TimelineStep } from "@/lib/events/schema";

/** Add a timeline step at the end. */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/events/[id]/steps">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const parsed = StepFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "ধাপের তথ্য ঠিক নেই", parsed.error.issues);
  return applyChange(
    id,
    async (cur) => {
      const own = new Set(cur.sources.map((s) => s.id));
      if (parsed.data.source_ids.some((s) => !own.has(s))) throw new Error("এই ঘটনার নয় এমন সূত্র যুক্ত করা যায় না");
      await addStep(id, parsed.data, admin.userId);
    },
    (cur) => ({ ...cur, steps: [...cur.steps, { ...parsed.data, id: "new", event_id: id, position: cur.steps.length } as TimelineStep] }),
  );
}
