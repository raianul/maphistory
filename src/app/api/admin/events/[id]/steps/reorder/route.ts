import { requireAdmin } from "@/lib/admin-auth";
import { reorderSteps } from "@/lib/events/db";
import { applyChange, badRequest, isId } from "@/lib/events/route-helpers";

/** Set the timeline's order: { step_ids: [...] } with every step of the event exactly once. */
export async function PUT(req: Request, { params }: RouteContext<"/api/admin/events/[id]/steps/reorder">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const ids = (await req.json().catch(() => null))?.step_ids;
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every((x) => typeof x === "string" && isId(x))) return badRequest("Invalid step order");
  // Reordering never changes what is published, beyond the order itself (no publish check needed).
  return applyChange(id, () => reorderSteps(id, ids));
}
