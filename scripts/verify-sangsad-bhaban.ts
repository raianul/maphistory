/**
 * Marks জাতীয় সংসদ ভবন (/place/jatiyo-sangsad-bhaban) as verified: its key dates checked against
 * the sources below, the sources themselves, and the corrected dates (planning began in 1959, not
 * 1961: the era line, the first period and the "Second Capital Complex" name) and area (208 acres,
 * not 200). The rest of the AI's story is left as it is.
 *
 *   tsx --env-file=.env.local scripts/verify-sangsad-bhaban.ts            # preview, nothing saved
 *   tsx --env-file=.env.local scripts/verify-sangsad-bhaban.ts --write    # save
 *
 * Checked 23 Nov 2026. Each date and where it is stated:
 *   1959, 1961, Mar 1962, 1964, 1971, 28 Jan 1982, 15 Feb 1982 · Banglapedia
 *   1961, 1964, 1971, 1982, 1989 award                          · Wikipedia (Jatiya Sangsad Bhaban)
 *   17 Mar 1974 (Kahn's death)                                  · Wikipedia (Louis Kahn)
 *   1989 award (1987–1989 cycle)                                · AKDN
 *   208 acres                                                   · Banglapedia
 *   Construction began in 1964: the sources give the year only (no month).
 */
import { db } from "../src/lib/db";
import type { AiStoryDataT } from "../src/lib/ai/place-story";

const SLUG = "jatiyo-sangsad-bhaban";
const write = process.argv.includes("--write");

const ORIGIN = "১৯৫৯ (পরিকল্পনা) / ১৯৮২ (উদ্বোধন)";

const KEY_DATES: NonNullable<AiStoryDataT["key_dates"]> = [
  { date_bn: "১৯৫৯", text_bn: "ঢাকাকে পাকিস্তানের দ্বিতীয় রাজধানী করার সিদ্ধান্ত; এখানে সংসদ ভবন কমপ্লেক্স গড়ার পরিকল্পনা শুরু।" },
  { date_bn: "১৯৬১", text_bn: "শেরেবাংলা নগরে, আজকের মানিক মিয়া অ্যাভিনিউর উত্তরে, ২০৮ একর জমি অধিগ্রহণ।" },
  { date_bn: "মার্চ ১৯৬২", text_bn: "মার্কিন স্থপতি লুই আই. কান আনুষ্ঠানিকভাবে নকশার দায়িত্ব পান।" },
  { date_bn: "১৯৬৪", text_bn: "নির্মাণকাজ শুরু।" },
  { date_bn: "১৯৭১", text_bn: "মুক্তিযুদ্ধের সময় নির্মাণকাজ বন্ধ হয়ে যায়।" },
  { date_bn: "১৭ মার্চ ১৯৭৪", text_bn: "নিউ ইয়র্কে লুই কানের মৃত্যু; ভবন তখনো অসমাপ্ত।" },
  { date_bn: "২৮ জানুয়ারি ১৯৮২", text_bn: "তৎকালীন রাষ্ট্রপতি বিচারপতি আবদুস সাত্তার ভবনটি উদ্বোধন করেন।" },
  { date_bn: "১৫ ফেব্রুয়ারি ১৯৮২", text_bn: "এই ভবনে জাতীয় সংসদের প্রথম অধিবেশন।" },
  { date_bn: "১৯৮৯", text_bn: "আগা খান স্থাপত্য পুরস্কার লাভ।" },
];

const SOURCES: NonNullable<AiStoryDataT["sources"]> = [
  {
    title: "Jatiya Sangsad Bhaban",
    author_or_institution: "Banglapedia, Asiatic Society of Bangladesh",
    type: "reference",
    url: "https://en.banglapedia.org/index.php/Jatiya_Sangsad_Bhaban",
  },
  { title: "Jatiya Sangsad Bhaban", author_or_institution: "Wikipedia", type: "reference", url: "https://en.wikipedia.org/wiki/Jatiya_Sangsad_Bhaban" },
  {
    title: "A 2,000-year journey through Bengal's architecture",
    author_or_institution: "Sajid Bin Doza, The Daily Star",
    year: 2025,
    type: "reference",
    url: "https://www.thedailystar.net/slow-reads/big-picture/news/architecture-mirror-politics-4045921",
  },
  {
    title: "National Assembly Building",
    author_or_institution: "Aga Khan Award for Architecture (AKDN)",
    type: "institutional",
    url: "https://the.akdn/en/how-we-work/our-agencies/aga-khan-trust-culture/akaa/national-assembly-building",
  },
  { title: "Louis Kahn", author_or_institution: "Wikipedia", type: "reference", url: "https://en.wikipedia.org/wiki/Louis_Kahn" },
];

const CORRECTIONS =
  "পরিকল্পনা শুরুর বছর ১৯৬১ লেখা ছিল; সূত্র অনুযায়ী ১৯৫৯ করা হয়েছে (১৯৬১ সালে জমি অধিগ্রহণ হয়)। পুরো পরিসরের আয়তন ২০০ নয়, ২০৮ একর।";

/** "১৯৬১–১৯৭১" → "১৯৫৯–১৯৭১" (the Pakistan-era project began with the 1959 decision). */
const fixRange = (v?: string) => (v === "১৯৬১–১৯৭১" ? "১৯৫৯–১৯৭১" : v);

async function main() {
  const { data, error } = await db().from("stories").select("id,status,verified_at,story").eq("slug", SLUG).single();
  if (error || !data) throw new Error(`No story at /place/${SLUG}: ${error?.message}`);
  const story = data.story as AiStoryDataT;
  const next: AiStoryDataT = {
    ...story,
    origin_bn: ORIGIN,
    periods: story.periods.map((p) => (p.range_bn === "১৯৬১–১৯৭১" ? { ...p, range_bn: fixRange(p.range_bn), start_year: 1959 } : p)),
    historical_names: story.historical_names?.map((n) => ({ ...n, when_bn: fixRange(n.when_bn) })),
    key_numbers: story.key_numbers?.map((k) => (k.value_bn === "২০০ একর" ? { ...k, value_bn: "২০৮ একর" } : k)),
    key_dates: KEY_DATES,
    sources: SOURCES,
    corrections_bn: CORRECTIONS,
  };
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const verifiedAt = data.verified_at ?? new Date().toISOString();

  console.log(`/place/${SLUG}  (status ${data.status} → verified)`);
  console.log(`  era line: ${story.origin_bn} → ${ORIGIN}`);
  console.log(`  first period range fixed: ${changed(story.periods, next.periods)}`);
  console.log(`  "Second Capital Complex" years fixed: ${changed(story.historical_names, next.historical_names)}`);
  console.log(`  area fixed (২০৮ একর): ${changed(story.key_numbers, next.key_numbers)}`);
  console.log(`  key dates: ${KEY_DATES.length}, sources: ${SOURCES.length}`);
  console.log(`  correction note: ${CORRECTIONS}`);
  if (!write) return console.log("\nPreview only: run with --write to save.");

  const { error: e } = await db().from("stories").update({ story: next, status: "verified", verified_at: verifiedAt }).eq("id", data.id);
  if (e) throw new Error(e.message);
  console.log("\nSaved. The page refreshes within the hour (or on the next deploy).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
