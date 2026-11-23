/**
 * Historical events (curated by editors in /admin/events): validation shared by
 * the admin API and its tests. Mirrors the checks in the database migration
 * (supabase/migrations/20261119000000_historical_events.sql), so a bad edit is
 * refused with a clear message before it reaches the database. Client-safe.
 */
import { z } from "zod";
import { inRegion } from "../region";

export const EVENT_STATUSES = ["draft", "research", "review", "published", "archived"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const DATE_PRECISIONS = ["day", "month", "year", "approximate"] as const;
export const SOURCE_TYPES = ["book", "archive", "academic", "article", "encyclopedia", "government", "oral", "other"] as const;

export const STATUS_BN: Record<EventStatus, string> = {
  draft: "খসড়া",
  research: "গবেষণা চলছে",
  review: "পর্যালোচনা",
  published: "প্রকাশিত",
  archived: "আর্কাইভ",
};

/** Admin (English interface) labels for statuses. Visitors never see statuses. */
export const STATUS_EN: Record<EventStatus, string> = {
  draft: "Draft",
  research: "Researching",
  review: "In review",
  published: "Published",
  archived: "Archived",
};

/** Admin labels for source types (visitors see SOURCE_TYPE_BN). */
export const SOURCE_TYPE_EN: Record<(typeof SOURCE_TYPES)[number], string> = {
  book: "Book",
  archive: "Archive / document",
  academic: "Academic paper",
  article: "Article / news",
  encyclopedia: "Encyclopedia",
  government: "Government record",
  oral: "Oral account",
  other: "Other",
};

export const SOURCE_TYPE_BN: Record<(typeof SOURCE_TYPES)[number], string> = {
  book: "বই",
  archive: "আর্কাইভ/দলিল",
  academic: "গবেষণাপত্র",
  article: "প্রবন্ধ/সংবাদ",
  encyclopedia: "বিশ্বকোষ",
  government: "সরকারি নথি",
  oral: "মৌখিক বিবরণ",
  other: "অন্যান্য",
};

/**
 * Which status changes are allowed. A draft can be published straight away (the admin has reviewed
 * it on the preview; publishing verifies it); unpublishing sends an event back to review; archived
 * events can be restored as drafts.
 */
export const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ["research", "review", "published", "archived"],
  research: ["draft", "review", "published", "archived"],
  review: ["draft", "research", "published", "archived"],
  published: ["review", "archived"],
  archived: ["draft"],
};

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

/** http(s) links only (no javascript:, data:, …). */
const HttpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Link must start with http:// or https://");

export const Slug = z
  .string()
  .trim()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: lowercase English letters, digits and hyphens (e.g. language-movement-1952)");

/** A cover image chosen through the Commons search (licence already checked there). */
export const CoverImage = z.object({
  src: HttpUrl.refine((v) => new URL(v).hostname.endsWith("wikimedia.org"), "Only Wikimedia Commons images"),
  credit: z.object({
    author: z.string().trim().min(1).max(300),
    license: z.string().trim().min(1).max(120),
    licenseUrl: HttpUrl.optional(),
    sourceUrl: HttpUrl.refine((v) => new URL(v).hostname.endsWith("wikimedia.org"), "Only Wikimedia Commons images"),
  }),
});

const daysIn = (year: number | null | undefined, month: number) => new Date(Date.UTC(year ?? 2000, month, 0)).getUTCDate();

/** A story is about a person (a life) or an event (one happening). */
export const EVENT_KINDS = ["event", "person"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_KIND_EN: Record<EventKind, string> = { event: "Event", person: "Person" };

/** A Wikidata item id, e.g. "Q7241" (Rabindranath Tagore): the subject's identity across titles. */
export const WikidataId = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^Q[0-9]{1,12}$/, "A Wikidata id looks like Q7241")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/** The editable fields of an event (everything except status, which has its own route). */
export const EventFields = z
  .object({
    slug: Slug,
    title: z.string().trim().min(1, "Enter a title").max(200),
    summary: optText(600),
    narrative: optText(20000),
    language: z
      .string()
      .trim()
      .regex(/^[a-z]{2}$/)
      .default("bn"),
    event_year: z.number().int().min(-5000).max(2100).nullable().optional(),
    event_month: z.number().int().min(1).max(12).nullable().optional(),
    event_day: z.number().int().min(1).max(31).nullable().optional(),
    date_precision: z.enum(DATE_PRECISIONS),
    date_label: optText(120),
    recurring: z.boolean().default(false),
    place_name: optText(200),
    city: optText(120),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Two-letter country code, e.g. BD")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    cover_image: CoverImage.nullable().optional(),
    kind: z.enum(EVENT_KINDS).default("event"),
    wikidata_id: WikidataId,
  })
  .superRefine((e, ctx) => {
    const has = (v: unknown) => v !== null && v !== undefined;
    const need = (cond: boolean, path: string, message: string) => !cond && ctx.addIssue({ code: "custom", path: [path], message });
    switch (e.date_precision) {
      case "day":
        need(has(e.event_year) && has(e.event_month) && has(e.event_day), "event_day", "An exact day needs year, month and day");
        break;
      case "month":
        need(has(e.event_year) && has(e.event_month), "event_month", "Month precision needs year and month");
        need(!has(e.event_day), "event_day", "Leave the day empty when only the month is known");
        break;
      case "year":
        need(has(e.event_year), "event_year", "Year is required");
        need(!has(e.event_month) && !has(e.event_day), "event_month", "Leave month and day empty when only the year is known");
        break;
      case "approximate":
        need(has(e.date_label), "date_label", "An approximate date needs a date label, e.g. আনুমানিক ১৭৫৭ (c. 1757)");
        break;
    }
    // A real calendar day (31 April, 30 February … are refused; 29 February only in leap years).
    if (has(e.event_month) && has(e.event_day) && e.event_day! > daysIn(e.event_year, e.event_month!)) {
      ctx.addIssue({ code: "custom", path: ["event_day"], message: "This month doesn't have that many days" });
    }
    need(!e.recurring || e.date_precision === "day", "recurring", "Showing it every year needs an exact day");
    need(has(e.lat) === has(e.lng), "lat", "Enter both latitude and longitude, or leave both empty");
  });
export type EventFieldsT = z.infer<typeof EventFields>;

/** A source attached to an event. */
export const SourceFields = z.object({
  title: z.string().trim().min(1, "Enter the source name").max(300),
  url: HttpUrl.nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  author_or_publisher: optText(300),
  published_on: optText(60),
  source_type: z.enum(SOURCE_TYPES).default("other"),
  notes: optText(2000),
  verified: z.boolean().default(false),
  evidence_quote: optText(4000),
  position: z.number().int().min(0).max(10000).optional(),
});
export type SourceFieldsT = z.infer<typeof SourceFields>;

// ── Phases (Phase 2) ──────────────────────────────────────────────────────────────────────

/**
 * The fixed palette for event phases: the brand purple plus five colours from the era palette.
 * Each reads as text on the light panel (WCAG AA, 4.7–6.5:1) and they stay distinct on the map.
 */
export const PHASE_PALETTE = {
  purple: { hex: "#6b5b95", bn: "বেগুনি", en: "Purple" },
  crimson: { hex: "#b8324b", bn: "লাল", en: "Red" },
  teal: { hex: "#2e7d6b", bn: "সবুজ", en: "Green" },
  amber: { hex: "#8f6416", bn: "সোনালি", en: "Gold" },
  blue: { hex: "#2f6f9f", bn: "নীল", en: "Blue" },
  slate: { hex: "#4f5d6b", bn: "ধূসর", en: "Grey" },
} as const;
export type PhaseColor = keyof typeof PHASE_PALETTE;
export const PHASE_COLORS = Object.keys(PHASE_PALETTE) as PhaseColor[];

const PhaseId = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{1,40}$/, "Phase ID: lowercase English letters, digits, hyphens");

export const Phase = z.object({
  id: PhaseId,
  label: z.string().trim().min(1, "Enter the phase name").max(60),
  color: z.enum(PHASE_COLORS as [PhaseColor, ...PhaseColor[]]),
});
export type PhaseT = z.infer<typeof Phase>;

/** 1–4 phases for an event; ids and colours must not repeat. (0 is allowed while drafting.) */
export const Phases = z
  .array(Phase)
  .max(4, "At most 4 phases")
  .superRefine((ps, ctx) => {
    const dup = (k: "id" | "color", msg: string) =>
      new Set(ps.map((p) => p[k])).size !== ps.length && ctx.addIssue({ code: "custom", message: msg });
    dup("id", "Phase IDs must be unique");
    dup("color", "Each phase needs a different color");
  });

// ── Timeline steps (Phase 2) ──────────────────────────────────────────────────────────────

export const MAP_TYPES = ["marker", "route", "area", "none"] as const;
export const LOCATION_PRECISIONS = ["exact", "approximate", "unknown"] as const;
export const EVIDENCE_LEVELS = ["documented", "scholarly", "tradition", "disputed"] as const;

export const MAP_TYPE_BN: Record<(typeof MAP_TYPES)[number], string> = {
  marker: "একটি স্থান",
  route: "যাত্রাপথ (থেকে → পর্যন্ত)",
  area: "এলাকা (বৃত্ত)",
  none: "মানচিত্রে কিছু নয়",
};
export const LOCATION_PRECISION_BN: Record<(typeof LOCATION_PRECISIONS)[number], string> = {
  exact: "নির্দিষ্ট",
  approximate: "আনুমানিক",
  unknown: "অজানা",
};
export const EVIDENCE_BN: Record<(typeof EVIDENCE_LEVELS)[number], string> = {
  documented: "নথিভুক্ত",
  scholarly: "গবেষকদের ব্যাখ্যা",
  tradition: "লোকঐতিহ্য",
  disputed: "বিতর্কিত",
};

/** Admin (English interface) versions of the timeline labels; visitors keep the Bangla ones above. */
export const MAP_TYPE_EN: Record<(typeof MAP_TYPES)[number], string> = {
  marker: "A place",
  route: "A route (from → to)",
  area: "An area (circle)",
  none: "Nothing on the map",
};
export const LOCATION_PRECISION_EN: Record<(typeof LOCATION_PRECISIONS)[number], string> = {
  exact: "Exact",
  approximate: "Approximate",
  unknown: "Unknown",
};
export const EVIDENCE_EN: Record<(typeof EVIDENCE_LEVELS)[number], string> = {
  documented: "Documented",
  scholarly: "Scholars' interpretation",
  tradition: "Tradition / folklore",
  disputed: "Disputed",
};

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);

/** A timeline step's editable fields, checked against its map type and how well its place is known. */
export const StepFields = z
  .object({
    title: z.string().trim().min(1, "Enter the step title").max(200),
    narrative: optText(5000),
    date_label: optText(120),
    sort_minutes: z.number().int().min(-5256000).max(5256000).nullable().optional(),
    phase_id: PhaseId.nullable().optional(),
    map_type: z.enum(MAP_TYPES),
    location_precision: z.enum(LOCATION_PRECISIONS),
    place_name: optText(200),
    lat: Lat.nullable().optional(),
    lng: Lng.nullable().optional(),
    from_place_name: optText(200),
    from_lat: Lat.nullable().optional(),
    from_lng: Lng.nullable().optional(),
    radius_m: z.number().int().min(10, "Radius must be at least 10 m").max(200000, "Radius can't exceed 200 km").nullable().optional(),
    image: CoverImage.nullable().optional(),
    evidence: z.enum(EVIDENCE_LEVELS),
    /** The step's date as numbers, when known (year; year+month; or a full date). Gregorian. */
    step_year: z.number().int().min(-5000).max(2100).nullable().optional(),
    step_month: z.number().int().min(1).max(12).nullable().optional(),
    step_day: z.number().int().min(1).max(31).nullable().optional(),
    verified: z.boolean().default(false),
    /** The event's sources that back this step (ids). */
    source_ids: z.array(z.uuid()).max(50).default([]),
  })
  .transform((s) => {
    // Keep only what the map type uses, so stale coordinates never linger (e.g. after marker → none).
    const draws = s.map_type !== "none" && s.location_precision !== "unknown";
    return {
      ...s,
      lat: draws ? (s.lat ?? null) : null,
      lng: draws ? (s.lng ?? null) : null,
      from_lat: draws && s.map_type === "route" ? (s.from_lat ?? null) : null,
      from_lng: draws && s.map_type === "route" ? (s.from_lng ?? null) : null,
      from_place_name: s.map_type === "route" ? (s.from_place_name ?? null) : null,
      radius_m: s.map_type === "area" ? (s.radius_m ?? null) : null,
    };
  })
  .superRefine((s, ctx) => {
    const has = (v: unknown) => v !== null && v !== undefined;
    const need = (cond: boolean, path: string, message: string) => !cond && ctx.addIssue({ code: "custom", path: [path], message });
    need(has(s.lat) === has(s.lng), "lat", "Both latitude and longitude are required");
    need(has(s.from_lat) === has(s.from_lng), "from_lat", "The start place needs both latitude and longitude");
    const draws = s.map_type !== "none" && s.location_precision !== "unknown";
    if (draws) {
      need(has(s.lat), "lat", s.map_type === "route" ? "Choose the destination" : s.map_type === "area" ? "Choose the area's center" : "Choose a place");
      if (s.map_type === "route") need(has(s.from_lat), "from_lat", "Choose the route's start place");
      if (s.map_type === "area") need(has(s.radius_m), "radius_m", "Enter the area's radius");
    }
    // Verified means checked against sources: at least one must back it.
    need(!s.verified || s.source_ids.length > 0, "verified", "Can't mark as verified without attaching at least one source");
    // A date is a year, a year and month, or a real full date.
    need(!has(s.step_month) || has(s.step_year), "step_year", "Enter the year");
    need(!has(s.step_day) || has(s.step_month), "step_month", "Enter the month");
    if (has(s.step_year) && has(s.step_month) && has(s.step_day)) {
      need(s.step_day! <= daysIn(s.step_year, s.step_month!), "step_day", "That month doesn't have that many days");
    }
  });
export type StepFieldsT = z.infer<typeof StepFields>;

/** A step as stored, with the ids of the sources linked to it. */
export type TimelineStep = Omit<StepFieldsT, "source_ids"> & {
  id: string;
  event_id: string;
  position: number;
  source_ids: string[];
  created_at: string;
  updated_at: string;
};

/** The event as stored (what the admin API returns). */
export type HistoricalEvent = EventFieldsT & {
  phases: PhaseT[];
  id: string;
  status: EventStatus;
  published_at: string | null;
  ai_assisted: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── Anniversaries: the dates a story appears on "On this day" ─────────────────────────────

export const DATE_STATUSES = ["draft", "published"] as const;

/** One "On this day" date of a story, with that day's own title. Gregorian dates only. */
export const DateFields = z
  .object({
    year: z.number().int().min(1).max(2100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    title: z.string().trim().min(1, "Enter the headline for this date").max(200),
    summary: optText(600),
    /** The step the story opens at on this date; null opens at the first step. */
    step_id: z.uuid().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.day > daysIn(d.year, d.month)) ctx.addIssue({ code: "custom", path: ["day"], message: "That month doesn't have that many days" });
  });
export type DateFieldsT = z.infer<typeof DateFields>;

export type EventDate = DateFieldsT & {
  id: string;
  event_id: string;
  step_id: string | null;
  status: (typeof DATE_STATUSES)[number];
  created_at: string;
  updated_at: string;
};

/** The step whose exact date is this one (the step a new anniversary opens at), if any. */
export function stepOnDate(steps: Pick<TimelineStep, "id" | "step_year" | "step_month" | "step_day">[], d: { year: number; month: number; day: number }): string | null {
  return steps.find((s) => s.step_year === d.year && s.step_month === d.month && s.step_day === d.day)?.id ?? null;
}

/** A row in the admin list. */
export type EventListRow = Pick<
  HistoricalEvent,
  "id" | "slug" | "title" | "status" | "event_year" | "event_month" | "event_day" | "date_precision" | "date_label" | "recurring" | "place_name" | "city" | "country" | "updated_at" | "published_at"
> & { source_count: number };

export type EventSource = SourceFieldsT & {
  id: string;
  event_id: string;
  origin: "editor" | "ai_suggestion";
  position: number;
  created_at: string;
  updated_at: string;
};

/**
 * What must be true before an event can be published. Returns the problems, in Bangla, or [] when
 * it is ready.
 *
 * Publishing IS the admin's verification: clicking "publish" marks the event's sources and steps
 * as verified by that admin (lib/events/publish.ts). So this list holds only what would make the
 * public page broken or misleading — text, a date, a source, a place on the map, steps that can be
 * drawn — not per-item "verified" ticks.
 */
export function publishProblems(e: HistoricalEvent, sources: EventSource[], steps: TimelineStep[] = []): string[] {
  const problems: string[] = [];
  if (!e.summary) problems.push("Summary is missing");
  if (!sources.length) problems.push("At least one source is required");
  if (e.lat === null || e.lat === undefined) problems.push("Main place has no coordinates");
  // Follows the map: in Bangladesh-only mode the event's place must be in Bangladesh.
  else if (!inRegion(e.lat, e.lng!)) problems.push("Main place is outside the current map area (Bangladesh)");

  // Timeline: optional, but every step must be drawable (a place for those that show one).
  steps.forEach((s, i) => {
    const n = `Step ${i + 1}`;
    const draws = s.map_type !== "none" && s.location_precision !== "unknown";
    if (draws) {
      for (const [lat, lng, what] of [
        [s.lat, s.lng, "place"],
        ...(s.map_type === "route" ? [[s.from_lat, s.from_lng, "start place"] as const] : []),
      ] as const) {
        if (lat === null || lat === undefined || lng === null || lng === undefined) problems.push(`${n}: ${what} has no coordinates`);
        else if (!inRegion(lat, lng)) problems.push(`${n}: ${what} is outside the map area (Bangladesh)`);
      }
    }
  });
  return problems;
}


/** Whether a status change is allowed (publishing also needs publishProblems to be empty). */
export function canMove(from: EventStatus, to: EventStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Today's month and day in Bangladesh (Asia/Dhaka), whatever the server's clock zone. Used by
 * "On this day" (Phase 3); here so its rule is tested with the rest.
 */
export function todayInDhaka(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Whether an event belongs on "On this day" for a given date (Phase 3 uses the same rule in SQL):
 *   recurring, exact day       → every year on its month and day (29 Feb → 28 Feb in other years)
 *   not recurring, exact day   → only on that very date
 *   month / year / approximate → never on a day
 */
export function onThisDay(e: Pick<HistoricalEvent, "recurring" | "date_precision" | "event_year" | "event_month" | "event_day">, d: { year: number; month: number; day: number }): boolean {
  if (e.date_precision !== "day" || !e.event_month || !e.event_day) return false;
  const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const feb29Moved = e.event_month === 2 && e.event_day === 29 && !leap(d.year);
  const [m, day] = feb29Moved ? [2, 28] : [e.event_month, e.event_day];
  if (m !== d.month || day !== d.day) return false;
  return e.recurring || e.event_year === d.year;
}
