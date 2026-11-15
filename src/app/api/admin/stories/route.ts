import { requireAdmin } from "@/lib/admin-auth";
import { listStories } from "@/lib/db";

/** All saved stories for the admin map. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return Response.json({ stories: await listStories() });
}
