/**
 * The research report, as the admin sees it (after validation). Client-safe types.
 *
 * Every factual claim carries its own citations: a source id (S1 …) and the exact passage the AI
 * relied on. The application checks each passage really occurs in the retrieved text; a claim
 * whose citations don't check out is downgraded to "unverified", with the reason. These ratings
 * are the AI's own assessment, kept private in the research record; they never become an editor's
 * verification.
 */

/** The AI's assessment of support for a claim (private; not the public evidence levels). */
export const AI_EVIDENCE = ["strong", "moderate", "weak", "conflicting", "unverified"] as const;
export type AiEvidence = (typeof AI_EVIDENCE)[number];

export const AI_EVIDENCE_BN: Record<AiEvidence, string> = {
  strong: "দৃঢ় সমর্থন",
  moderate: "মাঝারি সমর্থন",
  weak: "দুর্বল সমর্থন",
  conflicting: "সূত্রে মতভেদ",
  unverified: "সমর্থন মেলেনি",
};

/** Suggested public evidence level for an accepted step (the admin chooses; this is the default). */
export const SUGGESTED_PUBLIC_EVIDENCE: Record<AiEvidence, "documented" | "scholarly" | "tradition" | "disputed"> = {
  strong: "documented",
  moderate: "scholarly",
  weak: "tradition",
  conflicting: "disputed",
  unverified: "disputed",
};

export type Citation = {
  source_id: string;
  /** The passage, word for word from the retrieved text. */
  quote: string;
  /** Set by the application: the passage was found in that source's retrieved text. */
  found: boolean;
};

export type Claim = {
  /** Stable id within the run, for accept/reject (e.g. "overview.summary", "step.3"). */
  id: string;
  text: string;
  citations: Citation[];
  evidence: AiEvidence;
  /** Why the evidence is what it is (always set when downgraded by the application). */
  note: string | null;
};

export type DatePrecision = "day" | "month" | "year" | "approximate" | "unknown";

export type SuggestedStep = Claim & {
  title: string;
  date_label: string | null;
  /** Position in the chronology (0-based), as suggested. */
  order: number;
  significance: string | null;
  place_name: string | null;
  location_precision: "exact" | "approximate" | "unknown";
  map_type: "marker" | "route" | "area" | "none";
  /** For routes: where the movement began. */
  from_place_name: string | null;
  phase: string | null;
  uncertainty: string | null;
};

export type ResearchReport = {
  overview: {
    title: string;
    /** Short English name, used only for the web address (slug). */
    title_en?: string | null;
    summary: Claim;
    background: Claim | null;
    date_text: string | null;
    date_precision: DatePrecision;
    year: number | null;
    month: number | null;
    day: number | null;
    main_place: string | null;
    context: Claim | null;
  };
  /** Phases only when they make historical sense (0–4). */
  phases: { id: string; label: string }[];
  steps: SuggestedStep[];
  disagreements: (Claim & { topic: string })[];
  /** What the material could not establish. */
  gaps: string[];
  /** Short notes on what each retrieved source supports (by id). */
  source_notes: Record<string, string>;
  /** What the application changed or dropped while checking the AI's answer. */
  validation: string[];
};

export type ResearchSource = {
  /** Short id the AI cites ("S1", "S2" …). */
  id: string;
  title: string;
  url: string;
  publisher: string;
  author: string | null;
  /** When the source was published or last revised (not the event's date). */
  published_on: string | null;
  source_type: "encyclopedia" | "article" | "archive" | "academic" | "government" | "other";
  /** How it got here. */
  origin: "wikipedia" | "admin_url";
  language: string;
  retrieval: "retrieved" | "failed";
  /** Why it couldn't be retrieved (failed only). */
  reason?: string;
  /** The text the AI saw (retrieved only), trimmed to EXCERPT_CHARS. */
  excerpt?: string;
  retrieved_at: string;
};

/** A reference found inside a retrieved page; never fetched, never cited as evidence. */
export type ResearchLead = { url: string; found_in: string; label: string | null };

/** A research run as stored and shown. */
export type ResearchRun = {
  id: string;
  event_id: string;
  status: "collecting" | "analysing" | "ready" | "failed";
  input: { title: string; context?: string; urls?: string[] };
  sources: ResearchSource[];
  leads: ResearchLead[];
  draft: ResearchReport | null;
  decisions: Record<string, { state: "accepted" | "rejected"; at: string; target_id?: string }>;
  model: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
