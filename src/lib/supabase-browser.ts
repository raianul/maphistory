"use client";

/**
 * Supabase in the browser, with the publishable key: can only read visible
 * stories (the database's rules) and handle the admin's login session.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function browserSupabase(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

/** fetch() for /api/admin/*, with the admin's login token attached. */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await browserSupabase().auth.getSession();
  return fetch(path, {
    ...init,
    headers: {
      ...init.headers,
      "Content-Type": "application/json",
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
  });
}
