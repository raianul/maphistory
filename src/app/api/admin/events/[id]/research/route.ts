import { requireAdmin } from "@/lib/admin-auth";
import { getEvent } from "@/lib/events/db";
import { isId, notFound } from "@/lib/events/route-helpers";
import { listRuns, runResearch, type Progress } from "@/lib/research/run";
import { z } from "zod";

/** An event's research runs (newest first), to review and compare. Admin only. */
export async function GET(req: Request, { params }: RouteContext<"/api/admin/events/[id]/research">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isId(id)) return notFound();
  try {
    return Response.json({ runs: await listRuns(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

const Start = z.object({
  title: z.string().trim().min(2, "শিরোনাম দিন").max(200),
  context: z.string().trim().max(1000).optional(),
  urls: z.array(z.string().trim().max(2000)).max(5, "সর্বোচ্চ ৫টি লিংক").default([]),
});

/**
 * Start a new research run (a separate record). Streams progress as newline-delimited JSON:
 *   {"type":"stage",…} {"type":"sources","run":…} {"type":"done","run":…} {"type":"error",…}
 * Writes nothing to the event, its sources or steps: research stays private until accepted.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/events/[id]/research">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (!isId(id)) return notFound();
  const parsed = Start.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "তথ্য ঠিক নেই" }, { status: 400 });
  const event = await getEvent(id).catch(() => undefined);
  if (!event) return notFound();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (p: Progress) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(p) + "\n"));
        } catch {
          // the browser has gone away; the run still finishes and is saved
        }
      };
      try {
        await runResearch(id, admin.userId, parsed.data, send, { signal: req.signal });
      } catch (e) {
        console.error("research:", e);
        // Never the raw error (it may name internals): a plain message.
        send({ type: "error", message: /মাইগ্রেশন/.test((e as Error).message) ? (e as Error).message : "গবেষণা চালানো যায়নি। একটু পরে আবার চেষ্টা করুন।" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
