import { AiStoryData } from "@/lib/ai/place-story";
import { CoverImage } from "@/lib/events/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { inRegion } from "@/lib/region";
import { isCategory, NO_CATEGORY, storeCategories } from "@/lib/categories";
import { clearReports, ensureSlug, getStoryForAdmin, refreshPlacePage, updateStory } from "@/lib/db";

/** One story with its reports. */
export async function GET(req: Request, { params }: RouteContext<"/api/admin/stories/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const story = await getStoryForAdmin((await params).id);
  return story ? Response.json(story) : Response.json({ error: "Not found" }, { status: 404 });
}

/**
 * Change a story: { action: "verify" | "unverify" | "hide" | "unhide" | "clear_reports" |
 * "show_on_map" | "hide_from_map" }, { story: <edited story JSON> }, { image: <Commons image> | null }, or
 * { category: <id>[] | "none" | null } (the map's filter chips; null = guessed from the story's kind)
 * { location: { lat, lng } } (moves the pin)
 * (a Wikimedia Commons picture chosen in the admin's picker, licence already checked; null removes it).
 */
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/stories/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string; story?: unknown; image?: unknown; category?: unknown; location?: unknown } | null;
  const current = await getStoryForAdmin(id);
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    if (body && "location" in body) {
      // Moving the pin (a wrong spot from the map search or the AI): { location: { lat, lng } }.
      const l = body.location as { lat?: unknown; lng?: unknown } | null;
      if (!l || typeof l.lat !== "number" || typeof l.lng !== "number" || !Number.isFinite(l.lat) || !Number.isFinite(l.lng)) {
        return Response.json({ error: "Location must be { lat, lng } numbers" }, { status: 400 });
      }
      if (!inRegion(l.lat, l.lng)) return Response.json({ error: "That point is outside Bangladesh" }, { status: 400 });
      await updateStory(id, { lat: Math.round(l.lat * 1e6) / 1e6, lng: Math.round(l.lng * 1e6) / 1e6 });
    } else if (body && "category" in body) {
      const c = body.category;
      const ok = c === null || c === NO_CATEGORY || isCategory(c) || (Array.isArray(c) && c.every(isCategory));
      if (!ok) return Response.json({ error: "Unknown category" }, { status: 400 });
      // The map's square for this place refreshes within about a minute (see /api/pins).
      await updateStory(id, { category: Array.isArray(c) ? storeCategories(c) : c });
    } else if (body && "image" in body) {
      // Only Commons images, with their credit (the same rule as event covers).
      const parsed = body.image === null ? null : CoverImage.safeParse(body.image);
      if (parsed && !parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid image data" }, { status: 400 });
      await updateStory(id, { image: parsed ? parsed.data : null });
    } else if (body?.story !== undefined) {
      const parsed = AiStoryData.safeParse(body.story);
      if (!parsed.success) {
        return Response.json({ error: "Invalid story structure: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ") }, { status: 400 });
      }
      await updateStory(id, { story: parsed.data, name_en: parsed.data.name_en, country: parsed.data.country ?? null });
    } else {
      switch (body?.action) {
        case "verify":
          await updateStory(id, {
            status: "verified",
            verified_at: new Date().toISOString(),
            verified_by: admin.userId,
            slug: current.slug ?? (await ensureSlug(id)),
          });
          break;
        case "unverify":
          await updateStory(id, { status: "ai", verified_at: null, verified_by: null });
          break;
        case "hide":
          await updateStory(id, { status: "hidden" });
          break;
        case "unhide":
          await updateStory(id, { status: current.verified_at ? "verified" : "ai" });
          break;
        case "clear_reports":
          await clearReports(id);
          break;
        // A pin on the public map, only when the admin says so.
        case "show_on_map":
        case "hide_from_map":
          await updateStory(id, { show_on_map: body.action === "show_on_map" });
          // The public map's square for this place refreshes within about a minute (see /api/pins).
          break;
        default:
          return Response.json({ error: "Unknown action" }, { status: 400 });
      }
    }
    // The place's page shows the change at once (text, pin = on search engines or not).
    await refreshPlacePage(id);
    return Response.json(await getStoryForAdmin(id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
