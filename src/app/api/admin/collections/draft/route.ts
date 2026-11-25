import { requireAdmin } from "@/lib/admin-auth";
import { friendlyError } from "@/lib/ai/generate";
import { draftCollection } from "@/lib/collection-draft";

// Gemini with Google Search, then one map search per place.
export const maxDuration = 120;

/** "Draft with AI": { title_bn, title_en? } → { title_en, intro_bn, places, dropped }. Saves nothing. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = (await req.json().catch(() => null)) as { title_bn?: unknown; title_en?: unknown } | null;
  const title_bn = typeof body?.title_bn === "string" ? body.title_bn.trim().slice(0, 120) : "";
  const title_en = typeof body?.title_en === "string" ? body.title_en.trim().slice(0, 120) : "";
  if (!title_bn) return Response.json({ error: "Write the Bangla title first" }, { status: 400 });
  try {
    return Response.json(await draftCollection(title_bn, title_en || undefined));
  } catch (e) {
    console.error(e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
