import { requireAdmin } from "@/lib/admin-auth";
import { adminHome } from "@/lib/admin-home";

/** The admin's Home page: what needs the editor today (counts, the next 7 days, lists). */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  try {
    return Response.json(await adminHome(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
