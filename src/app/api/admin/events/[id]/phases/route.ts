import { requireAdmin } from "@/lib/admin-auth";
import { setPhases } from "@/lib/events/db";
import { applyChange, badRequest } from "@/lib/events/route-helpers";
import { Phases } from "@/lib/events/schema";

/** Replace the event's phases (1–4, fixed palette). Steps on a removed phase lose it. */
export async function PUT(req: Request, { params }: RouteContext<"/api/admin/events/[id]/phases">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const parsed = Phases.safeParse((await req.json().catch(() => null))?.phases);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "পর্ব ঠিক নেই", parsed.error.issues);
  const kept = new Set(parsed.data.map((p) => p.id));
  return applyChange(
    id,
    () => setPhases(id, parsed.data, admin.userId),
    (cur) => ({
      ...cur,
      event: { ...cur.event, phases: parsed.data },
      steps: cur.steps.map((s) => (s.phase_id && !kept.has(s.phase_id) ? { ...s, phase_id: null } : s)),
    }),
  );
}
