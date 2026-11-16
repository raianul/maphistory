import { AiStoryData } from "@/lib/ai/place-story";
import { requireAdmin } from "@/lib/admin-auth";
import { clearReports, getStoryForAdmin, uniqueSlug, updateStory } from "@/lib/db";

/** One story with its reports. */
export async function GET(req: Request, { params }: RouteContext<"/api/admin/stories/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const story = await getStoryForAdmin((await params).id);
  return story ? Response.json(story) : Response.json({ error: "পাওয়া যায়নি" }, { status: 404 });
}

/**
 * Change a story: { action: "verify" | "unverify" | "hide" | "unhide" | "clear_reports" |
 * "show_on_map" | "hide_from_map" } or { story: <edited story JSON> }.
 */
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/stories/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: string; story?: unknown } | null;
  const current = await getStoryForAdmin(id);
  if (!current) return Response.json({ error: "পাওয়া যায়নি" }, { status: 404 });

  try {
    if (body?.story !== undefined) {
      const parsed = AiStoryData.safeParse(body.story);
      if (!parsed.success) {
        return Response.json({ error: "গল্পের গঠন ঠিক নেই: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ") }, { status: 400 });
      }
      await updateStory(id, { story: parsed.data, name_en: parsed.data.name_en, country: parsed.data.country ?? null });
    } else {
      switch (body?.action) {
        case "verify":
          await updateStory(id, {
            status: "verified",
            verified_at: new Date().toISOString(),
            verified_by: admin.userId,
            slug: current.slug ?? (await uniqueSlug(current.name_en ?? current.story?.name_en ?? "", id)),
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
    return Response.json(await getStoryForAdmin(id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
