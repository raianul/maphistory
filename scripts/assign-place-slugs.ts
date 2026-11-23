/**
 * Gives every saved AI story its page address (/place/<slug>), once. New stories get theirs when
 * saved; this fills in the older ones. Safe to run again: a story that has a slug keeps it.
 *
 *   tsx --env-file=.env.local scripts/assign-place-slugs.ts            # preview, nothing saved
 *   tsx --env-file=.env.local scripts/assign-place-slugs.ts --write    # save
 *
 * Fixed choices (decided by the editor):
 *  - Places that also have a hand-written page share its address, so there is one page per place.
 *  - A few English names the AI got wrong are corrected here.
 */
import { db, ensureSlug } from "../src/lib/db";

/** By the story's map name (name_bn, as saved): its address. */
const FIXED: Record<string, string> = {
  "ahsan manzil": "ahsan-manzil", // hand-written page
  "জাতীয় স্টেডিয়াম, ঢাকা": "national-stadium-dhaka", // hand-written page
  "vai vai hostel ভাই ভাই হোস্টেল": "vai-vai-hostel", // the AI's English name was wrong
};

const write = process.argv.includes("--write");

async function main() {
  const { data, error } = await db().from("stories").select("id, name_bn, name_en, slug, status").neq("status", "hidden").order("created_at");
  if (error) throw new Error(error.message);
  let assigned = 0;
  for (const s of data ?? []) {
    if (s.slug) {
      console.log(`  keeps   /place/${s.slug}   ${s.name_bn}`);
      continue;
    }
    const fixed = FIXED[s.name_bn];
    if (!write) {
      console.log(`  would   ${fixed ? `/place/${fixed}` : "(from English name)"}   ${s.name_bn}${s.name_en ? ` · ${s.name_en}` : ""}`);
      continue;
    }
    if (fixed) {
      const { error: e } = await db().from("stories").update({ slug: fixed }).eq("id", s.id).is("slug", null);
      if (e) throw new Error(`${s.name_bn}: ${e.message}`);
      console.log(`  set     /place/${fixed}   ${s.name_bn}`);
    } else {
      console.log(`  set     /place/${await ensureSlug(s.id)}   ${s.name_bn}`);
    }
    assigned++;
  }
  console.log(write ? `\n${assigned} address(es) saved.` : "\nPreview only: run with --write to save.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
