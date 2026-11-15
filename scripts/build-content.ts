/**
 * Checks content/places/ and writes what the site needs (see src/lib/content.ts).
 * Only published places are built, unless --drafts is passed or SHOW_DRAFTS=1
 * (`pnpm dev` passes --drafts so drafts can be previewed).
 */
import { buildContent } from "../src/lib/content";

const drafts = process.argv.includes("--drafts") || process.env.SHOW_DRAFTS === "1";

buildContent({ drafts }).then((r) => {
  if (!r.ok) {
    console.error(`\nContent check failed (${r.errors.length}):\n` + r.errors.map((e) => `  - ${e}`).join("\n") + "\n");
    process.exit(1);
  }
  console.log(
    `Content OK: ${r.built} place(s) built` +
      (r.skipped ? `, ${r.skipped} unpublished skipped` : "") +
      (drafts ? " (drafts included)" : ""),
  );
});
