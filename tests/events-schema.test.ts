/** Historical events (Phase 1): field rules, status changes, publish checklist, date matching. */
import { describe, expect, it } from "vitest";
import {
  canMove,
  EventFields,
  onThisDay,
  PHASE_PALETTE,
  Phases,
  publishProblems,
  SourceFields,
  StepFields,
  todayInDhaka,
  type EventSource,
  type HistoricalEvent,
  type TimelineStep,
} from "../src/lib/events/schema";
import { circle, drawsOnMap, stepBounds } from "../src/lib/events/draw";

const base = { slug: "language-movement-1952", title: "ভাষা আন্দোলন", date_precision: "day" as const, event_year: 1952, event_month: 2, event_day: 21 };

describe("EventFields", () => {
  it("accepts a complete exact-day event", () => {
    expect(EventFields.safeParse({ ...base, recurring: true, lat: 23.7279, lng: 90.3961, country: "bd" }).success).toBe(true);
  });

  it.each([
    ["bad slug (spaces, capitals)", { ...base, slug: "Bad Slug" }],
    ["day precision without a day", { ...base, event_day: null }],
    ["month precision with a day", { ...base, date_precision: "month" }],
    ["year precision with a month", { ...base, date_precision: "year", event_day: null }],
    ["approximate without a label", { slug: "x", title: "x", date_precision: "approximate" }],
    ["31 April", { ...base, event_month: 4, event_day: 31 }],
    ["29 February in a non-leap year", { ...base, event_year: 1951, event_month: 2, event_day: 29 }],
    ["recurring without an exact day", { slug: "x", title: "x", date_precision: "year", event_year: 1757, recurring: true }],
    ["only one coordinate", { ...base, lat: 23.7 }],
    ["latitude out of range", { ...base, lat: 123, lng: 90 }],
    ["country not a 2-letter code", { ...base, country: "BGD" }],
    ["image not from Commons", { ...base, cover_image: { src: "https://example.com/a.jpg", credit: { author: "a", license: "CC BY", sourceUrl: "https://example.com" } } }],
  ])("refuses %s", (_label, input) => {
    expect(EventFields.safeParse(input).success).toBe(false);
  });

  it("accepts 29 February in a leap year, and approximate dates with a label", () => {
    expect(EventFields.safeParse({ ...base, event_year: 1952, event_month: 2, event_day: 29 }).success).toBe(true);
    expect(EventFields.safeParse({ slug: "plassey", title: "x", date_precision: "approximate", date_label: "আনুমানিক ১৭৫৭" }).success).toBe(true);
  });

  it("turns empty optional text into null and upper-cases the country", () => {
    const r = EventFields.parse({ ...base, summary: "  ", country: "bd" });
    expect(r.summary).toBeNull();
    expect(r.country).toBe("BD");
  });
});

describe("SourceFields", () => {
  it("accepts http(s) links and no link", () => {
    expect(SourceFields.safeParse({ title: "Banglapedia", url: "https://en.banglapedia.org/x" }).success).toBe(true);
    expect(SourceFields.safeParse({ title: "A book", url: "" }).success).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "ftp://x.org/a", "not a url"])("refuses %s", (url) => {
    expect(SourceFields.safeParse({ title: "x", url }).success).toBe(false);
  });
});

describe("status changes", () => {
  it("publishes from draft or review, unpublishes back to review, restores archived as draft", () => {
    expect(canMove("draft", "published")).toBe(true);
    expect(canMove("review", "published")).toBe(true);
    expect(canMove("published", "review")).toBe(true);
    expect(canMove("published", "draft")).toBe(false);
    expect(canMove("archived", "draft")).toBe(true);
    expect(canMove("archived", "published")).toBe(false);
  });
});

describe("publishProblems", () => {
  const ev = { ...base, id: "e", summary: "s", narrative: "n", lat: 23.7279, lng: 90.3961, status: "review" } as unknown as HistoricalEvent;
  const src = (o: Partial<EventSource>) => ({ title: "s", origin: "editor", verified: false, ...o }) as EventSource;

  it("passes a complete event; sources needn't be ticked (publishing verifies them)", () => {
    expect(publishProblems(ev, [src({}), src({ origin: "ai_suggestion" })])).toEqual([]);
  });
  it("needs at least one source", () => {
    expect(publishProblems(ev, [])).toContain("অন্তত একটি সূত্র লাগবে");
  });
  it("needs a summary and a place inside the map's region (Bangladesh); the full text is optional", () => {
    const p = publishProblems({ ...ev, summary: null, narrative: null, lat: 48.85, lng: 2.35 } as HistoricalEvent, [src({})]);
    expect(p).toContain("সংক্ষিপ্ত বিবরণ নেই");
    expect(p).not.toContain("পূর্ণ বিবরণ নেই");
    expect(p).toContain("মূল স্থান বর্তমান মানচিত্রের এলাকার (বাংলাদেশ) বাইরে");
  });
});

describe("dates", () => {
  it("today is Bangladesh's date, not the server's", () => {
    // 20:30 UTC on 20 Feb is already 02:30 on 21 Feb in Dhaka (UTC+6).
    expect(todayInDhaka(new Date("2027-02-20T20:30:00Z"))).toEqual({ year: 2027, month: 2, day: 21 });
    expect(todayInDhaka(new Date("2027-02-20T17:59:00Z"))).toEqual({ year: 2027, month: 2, day: 20 });
  });

  const exact = { date_precision: "day" as const, event_year: 1952, event_month: 2, event_day: 21 };
  it("recurring events come back every year; one-off events only on their date", () => {
    expect(onThisDay({ ...exact, recurring: true }, { year: 2027, month: 2, day: 21 })).toBe(true);
    expect(onThisDay({ ...exact, recurring: false }, { year: 2027, month: 2, day: 21 })).toBe(false);
    expect(onThisDay({ ...exact, recurring: false }, { year: 1952, month: 2, day: 21 })).toBe(true);
  });
  it("uncertain dates are never on a day", () => {
    expect(onThisDay({ date_precision: "month", event_year: 1971, event_month: 3, event_day: null, recurring: false }, { year: 2027, month: 3, day: 1 })).toBe(false);
    expect(onThisDay({ date_precision: "approximate", event_year: null, event_month: null, event_day: null, recurring: false }, { year: 2027, month: 1, day: 1 })).toBe(false);
  });
  it("29 February shows on 28 February in other years", () => {
    const leapDay = { date_precision: "day" as const, event_year: 1952, event_month: 2, event_day: 29, recurring: true };
    expect(onThisDay(leapDay, { year: 2027, month: 2, day: 28 })).toBe(true);
    expect(onThisDay(leapDay, { year: 2028, month: 2, day: 29 })).toBe(true);
    expect(onThisDay(leapDay, { year: 2028, month: 2, day: 28 })).toBe(false);
  });
});

// ── Phase 2: phases, steps, timeline checklist ───────────────────────────────────────────

describe("Phases", () => {
  it("accepts up to 4 distinct phases from the palette", () => {
    expect(Phases.safeParse([{ id: "attack", label: "হামলা", color: "crimson" }, { id: "funeral", label: "দাফন", color: "blue" }]).success).toBe(true);
  });
  it.each([
    ["5 phases", Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, label: "x", color: Object.keys(PHASE_PALETTE)[i % 6] }))],
    ["a colour outside the palette", [{ id: "a", label: "x", color: "#ff0000" }]],
    ["two phases with one colour", [{ id: "a", label: "x", color: "teal" }, { id: "b", label: "y", color: "teal" }]],
    ["two phases with one id", [{ id: "a", label: "x", color: "teal" }, { id: "a", label: "y", color: "blue" }]],
  ])("refuses %s", (_l, input) => {
    expect(Phases.safeParse(input).success).toBe(false);
  });
});

const SRC = "11111111-1111-4111-8111-111111111111";
const step = (o: Record<string, unknown>) => ({ title: "ধাপ", map_type: "marker", location_precision: "exact", evidence: "documented", ...o });

describe("StepFields", () => {
  it("a marker needs its place; a route needs start and end; an area needs a radius", () => {
    expect(StepFields.safeParse(step({})).success).toBe(false);
    expect(StepFields.safeParse(step({ lat: 23.7, lng: 90.4 })).success).toBe(true);
    expect(StepFields.safeParse(step({ map_type: "route", lat: 23.7, lng: 90.4 })).success).toBe(false);
    expect(StepFields.safeParse(step({ map_type: "route", lat: 23.7, lng: 90.4, from_lat: 23.8, from_lng: 90.39 })).success).toBe(true);
    expect(StepFields.safeParse(step({ map_type: "area", lat: 23.7, lng: 90.4 })).success).toBe(false);
    expect(StepFields.safeParse(step({ map_type: "area", lat: 23.7, lng: 90.4, radius_m: 800 })).success).toBe(true);
  });
  it("an unknown location needs nothing and keeps no coordinates (never drawn, never moves the map)", () => {
    const r = StepFields.parse(step({ location_precision: "unknown", lat: 23.7, lng: 90.4 }));
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
  });
  it("drops fields the map type doesn't use", () => {
    const r = StepFields.parse(step({ map_type: "marker", lat: 23.7, lng: 90.4, from_lat: 1, from_lng: 1, radius_m: 500 }));
    expect([r.from_lat, r.radius_m]).toEqual([null, null]);
  });
  it("radius is in metres, 10 m – 200 km", () => {
    expect(StepFields.safeParse(step({ map_type: "area", lat: 23.7, lng: 90.4, radius_m: 5 })).success).toBe(false);
    expect(StepFields.safeParse(step({ map_type: "area", lat: 23.7, lng: 90.4, radius_m: 250000 })).success).toBe(false);
  });
  it("can't be marked verified without at least one source", () => {
    expect(StepFields.safeParse(step({ lat: 23.7, lng: 90.4, verified: true })).success).toBe(false);
    expect(StepFields.safeParse(step({ lat: 23.7, lng: 90.4, verified: true, source_ids: [SRC] })).success).toBe(true);
  });
});

describe("publishProblems with a timeline", () => {
  const ev = { ...base, id: "e", summary: "s", narrative: "n", lat: 23.7279, lng: 90.3961, status: "review", phases: [{ id: "attack", label: "হামলা", color: "crimson" }] } as unknown as HistoricalEvent;
  const src = [{ id: SRC, title: "s", origin: "editor", verified: false }] as EventSource[];
  const good = { id: "s1", title: "ধাপ", phase_id: "attack", map_type: "marker", location_precision: "approximate", lat: 23.72, lng: 90.39, verified: false, source_ids: [] } as unknown as TimelineStep;

  it("passes drawable steps (unverified, unsourced, without a phase: publishing verifies)", () => {
    expect(publishProblems(ev, src, [good, { ...good, phase_id: null } as unknown as TimelineStep])).toEqual([]);
  });
  it("a step that should show a place but has none blocks publishing, by number", () => {
    const p = publishProblems(ev, src, [good, { ...good, lat: null, lng: null } as unknown as TimelineStep]);
    expect(p).toEqual(["ধাপ ২: স্থানের স্থানাঙ্ক নেই"]);
  });
  it("a step's place (or a route's start) outside the map's region blocks publishing", () => {
    const p = publishProblems(ev, src, [{ ...good, map_type: "route", from_lat: 22.57, from_lng: 88.36 } as TimelineStep]);
    expect(p).toContain("ধাপ ১: শুরুর স্থান মানচিত্রের এলাকার (বাংলাদেশ) বাইরে");
  });
  it("a step with an unknown location doesn't need coordinates", () => {
    expect(publishProblems(ev, src, [{ ...good, location_precision: "unknown", lat: null, lng: null } as unknown as TimelineStep])).toEqual([]);
  });
});

// ── Drawing helpers ──────────────────────────────────────────────────────────────────────

describe("draw helpers", () => {
  it("unknown locations and 'none' draw nothing and give no camera target", () => {
    const unknown = { map_type: "marker", location_precision: "unknown", lat: null } as unknown as TimelineStep;
    const none = { map_type: "none", location_precision: "exact", lat: 23.7 } as unknown as TimelineStep;
    expect(drawsOnMap(unknown)).toBe(false);
    expect(drawsOnMap(none)).toBe(false);
    expect(stepBounds(unknown)).toBeUndefined();
    expect(stepBounds(none)).toBeUndefined();
  });
  it("a circle of 1 km is about 1 km from its centre", () => {
    const [lng, lat] = circle({ lat: 23.7, lng: 90.4 }, 1000)[0];
    const dx = (lng - 90.4) * 111_320 * Math.cos((23.7 * Math.PI) / 180);
    const dy = (lat - 23.7) * 111_320;
    expect(Math.hypot(dx, dy)).toBeCloseTo(1000, -1);
  });
  it("an area's frame includes its whole circle", () => {
    const b = stepBounds({ map_type: "area", location_precision: "approximate", lat: 23.7, lng: 90.4, radius_m: 2000 } as unknown as TimelineStep)!;
    expect(b[1][1] - b[0][1]).toBeGreaterThan(0.03);
  });
});
