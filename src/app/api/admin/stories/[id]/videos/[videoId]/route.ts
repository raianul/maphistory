import { requireAdmin } from "@/lib/admin-auth";
import { deleteVideo, listVideos, refreshPlacePage, makeMainVideo } from "@/lib/db";

type Ctx = RouteContext<"/api/admin/stories/[id]/videos/[videoId]">;

/** Make this the place's main video. */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, videoId } = await params;
  try {
    await makeMainVideo(id, videoId);
    await refreshPlacePage(id);
    return Response.json({ videos: await listVideos(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id, videoId } = await params;
  try {
    await deleteVideo(id, videoId);
    await refreshPlacePage(id);
    return Response.json({ videos: await listVideos(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
