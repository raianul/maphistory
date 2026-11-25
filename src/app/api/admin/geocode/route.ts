import { requireAdmin } from "@/lib/admin-auth";
import { searchPlaces } from "@/lib/geocode";

/**
 * Place search for the admin's map picker: ?q=…  → [{ name, context, lat, lng }] (see lib/geocode).
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 120);
  if (!q || q.length < 2) return Response.json({ results: [] });
  const results = await searchPlaces(q);
  if (results === null) return Response.json({ error: "The place search service is not responding", results: [] }, { status: 502 });
  return Response.json({ results });
}
