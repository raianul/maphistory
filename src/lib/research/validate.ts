/**
 * Checking the AI's research answer. The answer is untrusted input, like any external data:
 *
 *  - Its shape is parsed with an allow-list (Zod). Anything not in the schema is dropped, so the
 *    AI cannot set `verified`, `status`, `published`, URLs, coordinates or anything else.
 *  - Every citation must name a RETRIEVED source (S1 …) and quote a passage that really occurs in
 *    that source's retrieved text (after normalising whitespace, quote marks and Unicode).
 *    Citations that fail are kept but marked found=false.
 *  - A claim with no checked citation is downgraded to "unverified", with the reason.
 *  - Unknown dates stay unknown; impossible dates are cleared; phases are limited to 4 and a step
 *    may only use one of them.
 * Everything changed is listed in report.validation, so the admin can see what the AI got wrong.
 */
import { z } from "zod";
import { AI_EVIDENCE, type AiEvidence, type Citation, type Claim, type ResearchReport, type ResearchSource, type SuggestedStep } from "./types";

/** Normalises text for quote matching: Unicode form, quote marks, dashes, zero-widths, whitespace, case. */
export function normalise(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Shortest quote accepted: shorter passages match by chance and prove nothing. */
const MIN_QUOTE = 12;

/** Whether `quote` occurs in `text` (normalised). */
export function quoteFound(quote: string, text: string): boolean {
  const q = normalise(quote).replace(/^["'.…\s]+|["'.…\s]+$/g, "");
  if (q.length < MIN_QUOTE) return false;
  // Footnote markers ("[12]", "[ক]", "[edit]") sit inside sentences on many pages.
  return normalise(text.replace(/\[\s*(?:\d{1,3}|[a-z]|[০-৯]{1,3}|[ক-হ]|edit|সম্পাদনা)\s*\]/gi, "")).replace(/ ([.,;:।])/g, "$1").includes(q.replace(/ ([.,;:।])/g, "$1"));
}

// ── What the AI may say (anything else is dropped) ─────────────────────────────────────────

const Str = (max: number) => z.string().trim().max(max);
/** Optional text; the AI's placeholders for "nothing" ("none", "N/A", "নেই", "-") count as empty. */
const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (/^(none|null|n\/?a|nil|unknown|-+|—|নেই|প্রযোজ্য নয়|অজানা)?$/i.test(v) ? null : v))
    .nullable()
    .optional()
    .catch(null);
const RawCitation = z.object({ source_id: Str(10), quote: Str(1200) });
const RawClaimFields = {
  text: Str(4000),
  citations: z.array(RawCitation).max(8).catch([]),
  evidence: z.enum(AI_EVIDENCE).catch("unverified"),
  note: optStr(600),
};
const RawClaim = z.object(RawClaimFields);
const RawStep = z.object({
  ...RawClaimFields,
  title: Str(200),
  date_label: optStr(120),
  order: z.number().int().min(0).max(200).catch(0),
  significance: optStr(1000),
  place_name: optStr(200),
  location_precision: z.enum(["exact", "approximate", "unknown"]).catch("unknown"),
  map_type: z.enum(["marker", "route", "area", "none"]).catch("none"),
  from_place_name: optStr(200),
  phase: optStr(40),
  uncertainty: optStr(800),
});

export const RawReport = z.object({
  overview: z.object({
    title: Str(200),
    title_en: optStr(120),
    summary: RawClaim,
    background: RawClaim.nullable().optional().catch(null),
    date_text: optStr(120),
    date_precision: z.enum(["day", "month", "year", "approximate", "unknown"]).catch("unknown"),
    year: z.number().int().min(-5000).max(2100).nullable().optional().catch(null),
    month: z.number().int().min(1).max(12).nullable().optional().catch(null),
    day: z.number().int().min(1).max(31).nullable().optional().catch(null),
    main_place: optStr(200),
    context: RawClaim.nullable().optional().catch(null),
  }),
  phases: z
    .array(z.object({ id: Str(40), label: Str(60) }))
    .max(10)
    .catch([]),
  steps: z.array(RawStep).max(40).catch([]),
  disagreements: z
    .array(z.object({ ...RawClaimFields, topic: Str(300) }))
    .max(20)
    .catch([]),
  gaps: z.array(Str(600)).max(20).catch([]),
  source_notes: z.record(z.string().max(10), Str(600)).catch({}),
});
export type RawReportT = z.infer<typeof RawReport>;

/** A claim with its citations checked; downgraded (with a reason) when nothing checks out. */
function checkClaim(id: string, raw: z.infer<typeof RawClaim>, byId: Map<string, ResearchSource>, log: string[]): Claim {
  const citations: Citation[] = raw.citations.map((c) => {
    const src = byId.get(c.source_id.trim().toUpperCase());
    const found = !!src && src.retrieval === "retrieved" && !!src.excerpt && quoteFound(c.quote, src.excerpt);
    return { source_id: c.source_id.trim().toUpperCase(), quote: c.quote, found };
  });
  const bad = citations.filter((c) => !c.found);
  for (const c of bad) {
    const src = byId.get(c.source_id);
    log.push(
      !src
        ? `${id}: অজানা সূত্র "${c.source_id}" বাদ — কেবল সংগ্রহ করা সূত্র উদ্ধৃত করা যায়`
        : src.retrieval !== "retrieved"
          ? `${id}: ${c.source_id} সংগ্রহ করা যায়নি, তাই প্রমাণ হিসেবে গণ্য নয়`
          : `${id}: ${c.source_id}-এর লেখায় উদ্ধৃতিটি পাওয়া যায়নি`,
    );
  }
  // Citations to sources that don't exist are dropped entirely (an invented id or URL says nothing).
  const kept = citations.filter((c) => byId.has(c.source_id));
  const anyFound = kept.some((c) => c.found);
  let evidence: AiEvidence = raw.evidence;
  let note = raw.note ?? null;
  if (!anyFound && evidence !== "unverified") {
    evidence = "unverified";
    note = `যাচাইযোগ্য উদ্ধৃতি নেই: ${bad.length ? "দেওয়া উদ্ধৃতি সূত্রের লেখায় মেলেনি" : "কোনো সূত্র উল্লেখ করা হয়নি"}${note ? ` (AI-এর মন্তব্য: ${note})` : ""}`;
  }
  // "Strong" needs more than one checked source or explicit primary material; one source caps at moderate.
  const distinct = new Set(kept.filter((c) => c.found).map((c) => c.source_id)).size;
  if (evidence === "strong" && distinct < 2) {
    evidence = "moderate";
    log.push(`${id}: "দৃঢ়" থেকে "মাঝারি" — মাত্র একটি সূত্রে সমর্থন`);
  }
  return { id, text: raw.text, citations: kept, evidence, note };
}

/** Whether day/month/year make a real date (else they are cleared). */
function realDate(y: number | null | undefined, m: number | null | undefined, d: number | null | undefined): boolean {
  if (!m || !d) return true;
  return d <= new Date(Date.UTC(y ?? 2000, m, 0)).getUTCDate();
}

/**
 * Turns the AI's raw JSON into a checked report. Returns null when the answer isn't a report at
 * all (the run then fails with a clear message, keeping the collected sources).
 */
export function validateReport(rawJson: unknown, sources: ResearchSource[]): ResearchReport | null {
  const parsed = RawReport.safeParse(rawJson);
  if (!parsed.success) return null;
  const r = parsed.data;
  const log: string[] = [];
  const byId = new Map(sources.map((s) => [s.id, s]));

  // Phases: only meaningful ones, at most 4, unique ids.
  const phases = r.phases
    .map((p) => ({ id: p.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40), label: p.label }))
    .filter((p, i, a) => p.id && p.label && a.findIndex((x) => x.id === p.id) === i);
  if (phases.length > 4) log.push(`AI ${phases.length}টি পর্ব প্রস্তাব করেছিল; প্রথম ৪টি রাখা হলো`);
  const keptPhases = phases.slice(0, 4);
  const phaseIds = new Set(keptPhases.map((p) => p.id));

  const o = r.overview;
  let { year, month, day } = o;
  let precision = o.date_precision;
  if (!realDate(year, month, day)) {
    log.push("প্রস্তাবিত তারিখ বাস্তব নয় (যেমন ৩১ এপ্রিল); তারিখ অনিশ্চিত হিসেবে রাখা হলো");
    [year, month, day, precision] = [year ?? null, null, null, year ? "year" : "unknown"];
  }
  // Precision must match what's given (no "exact day" without a day).
  if (precision === "day" && !(year && month && day)) precision = year ? "year" : "unknown";

  const steps: SuggestedStep[] = r.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      const claim = checkClaim(`step.${i}`, s, byId, log);
      const phase = s.phase ? s.phase.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") : null;
      if (phase && !phaseIds.has(phase)) log.push(`step.${i}: অজানা পর্ব "${s.phase}" বাদ দেওয়া হলো`);
      // No place, no map: an unknown location never gets a map type that would draw something.
      // A named place counts even when the AI marked it "unknown": the map lookup decides.
      const unknown = !s.place_name;
      return {
        ...claim,
        title: s.title,
        date_label: s.date_label ?? null,
        order: i,
        significance: s.significance ?? null,
        place_name: s.place_name ?? null,
        location_precision: unknown ? "unknown" : s.location_precision === "unknown" ? "approximate" : s.location_precision,
        map_type: unknown ? "none" : s.map_type === "none" ? "marker" : s.map_type === "route" && !s.from_place_name ? "marker" : s.map_type,
        from_place_name: s.map_type === "route" ? (s.from_place_name ?? null) : null,
        phase: phase && phaseIds.has(phase) ? phase : null,
        uncertainty: s.uncertainty ?? null,
      };
    });

  const source_notes = Object.fromEntries(
    Object.entries(r.source_notes)
      .map(([k, v]) => [k.trim().toUpperCase(), v] as const)
      .filter(([k]) => byId.has(k)),
  );

  return {
    overview: {
      title: o.title,
      title_en: o.title_en ?? null,
      summary: checkClaim("overview.summary", o.summary, byId, log),
      background: o.background ? checkClaim("overview.background", o.background, byId, log) : null,
      date_text: o.date_text ?? null,
      date_precision: precision,
      year: year ?? null,
      month: month ?? null,
      day: day ?? null,
      main_place: o.main_place ?? null,
      context: o.context ? checkClaim("overview.context", o.context, byId, log) : null,
    },
    phases: keptPhases,
    steps,
    disagreements: r.disagreements.map((d, i) => ({ ...checkClaim(`disagreement.${i}`, d, byId, log), topic: d.topic })),
    gaps: r.gaps,
    source_notes,
    validation: log,
  };
}
