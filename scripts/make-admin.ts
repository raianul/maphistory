/**
 * Makes an existing Supabase user an admin: pnpm make-admin you@example.com
 * (Create the user first: Supabase → Authentication → Users → Add user.)
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: pnpm make-admin you@example.com");
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) {
      const { error: e } = await db.from("admins").upsert({ user_id: user.id });
      if (e) throw e;
      console.log(`${email} is now an admin.`);
      return;
    }
    if (data.users.length < 200) break;
  }
  console.error(`No user with email ${email}. Create it in Supabase → Authentication → Users → Add user.`);
  process.exit(1);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
