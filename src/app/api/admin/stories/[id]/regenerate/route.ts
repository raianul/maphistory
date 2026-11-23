import { friendlyError, generatePlace } from "@/lib/ai/generate";
import { requireAdmin } from "@/lib/admin-auth";
import { getStoryForAdmin, refreshPlacePage, updateStory } from "@/lib/db";
import { reverseGeocode } from "@/lib/sources/reverse-geocode";

/** Write the story again with the AI. It goes back to "AI, not verified" until checked again. */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/stories/[id]/regenerate">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const current = await getStoryForAdmin(id);
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const place = await generatePlace({
      name: current.story?.name_bn ?? current.name_bn,
      lat: current.lat,
      lng: current.lng,
      kind: current.kind ?? undefined,
      context: await reverseGeocode(current.lat, current.lng),
    });
    await updateStory(id, {
      story: place.story,
      image: place.image ?? null,
      model: place.model,
      name_en: place.story.name_en,
      country: place.story.country ?? null,
      status: current.status === "hidden" ? "hidden" : "ai",
      verified_at: null,
      verified_by: null,
    });
    await refreshPlacePage(id);
    return Response.json(await getStoryForAdmin(id));
  } catch (e) {
    return Response.json({ error: friendlyError(e) }, { status: 500 });
  }
}
