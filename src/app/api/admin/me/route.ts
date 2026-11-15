import { requireAdmin } from "@/lib/admin-auth";

/** Is the logged-in user an admin? */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  return Response.json(admin);
}
