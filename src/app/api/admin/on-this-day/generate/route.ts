import { requireAdmin } from "@/lib/admin-auth";
import { CATEGORIES, COUNTRIES, type CountryCode } from "@/lib/research/discover";
import { generateDraft, type GenerateProgress } from "@/lib/research/generate";
import { z } from "zod";

/** Sources, one long AI call, place lookups and saving: give it time. */
export const maxDuration = 180;

const Body = z.object({
  day: z.number().int().min(1).max(31),
  month: z.number().int().min(1).max(12),
  country: z.enum(Object.keys(COUNTRIES) as [CountryCode, ...CountryCode[]]),
  candidate: z.object({
    year: z.number().int().min(-500).max(2100),
    title_bn: z.string().trim().min(2).max(200),
    summary_bn: z.string().trim().max(800).default(""),
    place: z.string().trim().max(200).default(""),
    category: z.enum(CATEGORIES).default("other"),
    source_url: z.string().trim().max(2000).regex(/^https?:\/\/[^\s]+$/i, "লিংক http(s) হতে হবে"),
    source_quote: z.string().trim().max(1200).default(""),
    check: z.object({ confirmed: z.boolean(), reason: z.string().max(500), page_title: z.string().max(300).nullable() }).optional(),
  }),
});

/**
 * Generate a DRAFT event (text + timeline + sources + map places) from one "On this day"
 * suggestion. Admin only. Streams progress as newline-delimited JSON:
 *   {"type":"stage","message":…} … {"type":"done","event_id":…,"warnings":[…]} | {"type":"error",…}
 * Nothing is verified or published here.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "তথ্য ঠিক নেই" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (p: GenerateProgress) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(p) + "\n"));
        } catch {
          // the browser has gone away; the draft is still saved
        }
      };
      try {
        await generateDraft(parsed.data, admin.userId, send);
      } catch (e) {
        console.error("on-this-day generate:", e);
        const m = (e as Error).message;
        send({ type: "error", message: /মাইগ্রেশন|স্লাগ/.test(m) ? m : "খসড়া তৈরি করা যায়নি। একটু পরে আবার চেষ্টা করুন।" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
