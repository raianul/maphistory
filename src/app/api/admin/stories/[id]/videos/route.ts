import { requireAdmin } from "@/lib/admin-auth";
import { addVideo, getStoryForAdmin, listVideos, refreshPlacePage } from "@/lib/db";
import { fetchVideoInfo } from "@/lib/sources/video-oembed";
import { parseDuration, parseVideoUrl } from "@/lib/video";

/** A place's videos. */
export async function GET(req: Request, { params }: RouteContext<"/api/admin/stories/[id]/videos">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return Response.json({ videos: await listVideos((await params).id) });
}

/**
 * Add a video: { url, language?, duration? ("12:34") }. The title and thumbnail come
 * from the provider (oEmbed), which also rejects links that don't exist or can't be embedded.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/admin/stories/[id]/videos">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { url?: unknown; language?: unknown; duration?: unknown } | null;

  const parsed = typeof body?.url === "string" ? parseVideoUrl(body.url) : undefined;
  if (!parsed) return Response.json({ error: "Not a supported video link (only YouTube for now)." }, { status: 400 });
  const language = typeof body?.language === "string" && /^[a-z]{2}$/.test(body.language) ? body.language : "bn";
  let durationSeconds: number | undefined;
  if (typeof body?.duration === "string" && body.duration.trim()) {
    durationSeconds = parseDuration(body.duration);
    if (!durationSeconds) return Response.json({ error: "Write the duration like 12:34 or 1:02:05" }, { status: 400 });
  }
  if (!(await getStoryForAdmin(id))) return Response.json({ error: "Place not found" }, { status: 404 });

  const info = await fetchVideoInfo(parsed.provider, parsed.providerVideoId);
  if (!info) return Response.json({ error: "Video not found or can't be embedded (deleted, private or wrong link)." }, { status: 422 });

  try {
    const video = await addVideo(id, { ...parsed, title: info.title, thumbnailUrl: info.thumbnailUrl, language, durationSeconds });
    await refreshPlacePage(id);
    return Response.json({ video, videos: await listVideos(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
