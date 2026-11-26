import { requireAdmin } from "@/lib/admin-auth";
import { friendlyError } from "@/lib/ai/generate";
import { suggestPlaces } from "@/lib/collection-draft";

// Gemini with Google Search, then one map search per place.
export const maxDuration = 120;

/**
 * "Suggest places with AI" for an area: { area } → { places, dropped }. Each place is located and
 * matched to saved stories (with whether it is already pinned). Saves nothing.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = (await req.json().catch(() => null)) as { area?: unknown } | null;
  const area = typeof body?.area === "string" ? body.area.trim().slice(0, 100) : "";
  if (area.length < 2) return Response.json({ error: "Write an area first" }, { status: 400 });
  try {
    return Response.json(await suggestPlaces(area));
  } catch (e) {
    console.error(e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
