import { requireAdmin } from "@/lib/admin-auth";
import { getEvent, withProblems } from "@/lib/events/db";
import { isId, notFound } from "@/lib/events/route-helpers";
import { AcceptError, decide, type Decision } from "@/lib/research/accept";
import { getRun } from "@/lib/research/run";
import { z } from "zod";

type Ctx = RouteContext<"/api/admin/events/[id]/research/[runId]">;

/** One research run. Admin only. */
export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, runId } = await params;
  if (!isId(id) || !isId(runId)) return notFound();
  const run = await getRun(id, runId).catch(() => undefined);
  return run ? Response.json({ run }) : notFound();
}

const DecisionBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reject"), key: z.string().regex(/^(overview\.(summary|narrative)|phases|step\.\d{1,3}|source\.S\d{1,3})$/) }),
  z.object({ kind: z.literal("source"), source_id: z.string().regex(/^S\d{1,3}$/) }),
  z.object({ kind: z.literal("overview"), field: z.enum(["summary", "narrative"]), text: z.string().max(20000), replace: z.boolean().optional() }),
  z.object({ kind: z.literal("phases") }),
  z.object({ kind: z.literal("step"), index: z.number().int().min(0).max(200), fields: z.record(z.string(), z.unknown()) }),
]);

/**
 * Accept or reject one suggestion: { kind: "reject" | "source" | "overview" | "phases" | "step", … }.
 * Accepted content becomes an editable, UNVERIFIED draft; nothing is published or verified here.
 * Answers with the event (as the editor uses it) and the run (with its decisions).
 */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, runId } = await params;
  if (!isId(id) || !isId(runId)) return notFound();
  const parsed = DecisionBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid decision" }, { status: 400 });
  try {
    await decide(id, runId, parsed.data as Decision, admin.userId);
    const [bundle, run] = await Promise.all([getEvent(id), getRun(id, runId)]);
    return Response.json({ ...withProblems(bundle!), run });
  } catch (e) {
    if (e instanceof AcceptError) return Response.json({ error: e.message }, { status: e.status });
    console.error("research decision:", e);
    return Response.json({ error: "Could not save the decision" }, { status: 500 });
  }
}
