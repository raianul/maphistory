/**
 * Admin API requests carry the admin's Supabase login (Authorization: Bearer
 * <access token>). The server checks the login is real AND that the user is
 * in the `admins` table before doing anything. Server-side only.
 */
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "./db";

export type Admin = { userId: string; email?: string };

/** The admin making this request, or a ready-to-return error response. */
export async function requireAdmin(req: Request): Promise<Admin | Response> {
  try {
    return await check(req);
  } catch (e) {
    console.error(e);
    return Response.json({ error: `সার্ভারে সমস্যা: ${(e as Error).message}` }, { status: 500 });
  }
}

async function check(req: Request): Promise<Admin | Response> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "লগইন করুন" }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "লগইন মেয়াদ শেষ, আবার লগইন করুন" }, { status: 401 });
  if (!(await isAdmin(data.user.id))) {
    return Response.json({ error: "এই অ্যাকাউন্টের অ্যাডমিন অনুমতি নেই", userId: data.user.id }, { status: 403 });
  }
  return { userId: data.user.id, email: data.user.email };
}
