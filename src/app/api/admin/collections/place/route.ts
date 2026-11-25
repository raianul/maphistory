import { requireAdmin } from "@/lib/admin-auth";
import { friendlyError, generatePlace } from "@/lib/ai/generate";
import type { StoryTarget } from "@/lib/ai/place-story";
import { ensureSlug, findStory, saveStory, updateStory } from "@/lib/db";
import { inRegion } from "@/lib/region";
import { reverseGeocode } from "@/lib/sources/reverse-geocode";

// Writing one story takes Gemini 20–60 seconds.
export const maxDuration = 180;

/**
 * A place "Draft with AI" suggested that the site doesn't have yet: its story is written and saved
 * (as any visitor's click would), and it gets a pin on the map. { name_bn, lat, lng, kind? } →
 * { story_id, label }. An existing story at that spot is reused.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = (await req.json().catch(() => null)) as { name_bn?: unknown; lat?: unknown; lng?: unknown; kind?: unknown } | null;
  const name = typeof body?.name_bn === "string" ? body.name_bn.trim().slice(0, 120) : "";
  if (!name || typeof body?.lat !== "number" || typeof body?.lng !== "number") return Response.json({ error: "name_bn, lat and lng are required" }, { status: 400 });
  if (!inRegion(body.lat, body.lng)) return Response.json({ error: "Only places in Bangladesh" }, { status: 400 });
  const target: StoryTarget = { name, lat: body.lat, lng: body.lng, kind: typeof body.kind === "string" && body.kind ? body.kind.slice(0, 40) : undefined };
  try {
    let saved = await findStory(target);
    if (!saved) {
      target.context = await reverseGeocode(target.lat, target.lng).catch(() => undefined);
      saved = await saveStory(target, await generatePlace(target, { signal: req.signal }));
    }
    if (!saved.id) throw new Error("The story was written but could not be saved");
    await Promise.all([saved.slug ? undefined : ensureSlug(saved.id).catch(() => undefined), updateStory(saved.id, { show_on_map: true }).catch(() => undefined)]);
    return Response.json({ story_id: saved.id, label: saved.story?.name_bn?.trim() || name });
  } catch (e) {
    console.error(e);
    return Response.json({ error: friendlyError(e) }, { status: 502 });
  }
}
