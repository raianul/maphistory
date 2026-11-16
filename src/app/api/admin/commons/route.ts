import { requireAdmin } from "@/lib/admin-auth";
import { findCommonsImages, findCommonsImagesNear } from "@/lib/sources/commons";

/**
 * Wikimedia Commons images for the admin's image picker, with the existing licence check:
 * ?q=… (text search) or ?lat=&lng= (geotagged nearby). Disallowed licences are returned with the
 * reason, so the picker can show but not offer them.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const p = new URL(req.url).searchParams;
  const q = p.get("q")?.trim().slice(0, 150);
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  try {
    const images =
      q && q.length >= 2
        ? await findCommonsImages({ search: q, limit: 24 })
        : Number.isFinite(lat) && Number.isFinite(lng) && p.has("lat")
          ? await findCommonsImagesNear(lat, lng, 1500, 24)
          : [];
    return Response.json({
      images: images.map((i) => ({ file: i.file, thumbUrl: i.thumbUrl, src: i.downloadUrl, width: i.width, height: i.height, credit: i.credit, allowed: i.allowed, reason: i.reason })),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message, images: [] }, { status: 502 });
  }
}
