/**
 * Historical events for visitors (the public map): only published events, only inside the map's
 * region, read through Next's server cache (tag EVENTS_CACHE_TAG). Every admin change that could
 * affect visitors clears that tag (lib/events/cache.ts), so an unpublished event is never served
 * from cache. Server-side only.
 */
import { unstable_cache } from "next/cache";
import { db, listPageCandidates } from "../db";
import { findPlacePage } from "../place-links";
import { inRegion } from "../region";
import { EVENTS_CACHE_TAG } from "./cache";
import type { EventSource, HistoricalEvent, PhaseT, TimelineStep } from "./schema";

/**
 * What the "On this day" list shows for one anniversary: that day's own title and summary
 * (e.g. "কর্নেল তাহেরের ফাঁসি"), the story it belongs to, and the step the story opens at.
 */
export type PublicEventCard = {
  slug: string;
  /** That date's headline. */
  title: string;
  /** The story's own title (e.g. "কর্নেল আবু তাহের"). */
  story_title: string;
  kind: "person" | "event";
  /** The step the story opens at on this date, 1-based (null: the first). */
  step: number | null;
  /** This anniversary's month and day, MM-DD. */
  md: string;
  summary: string | null;
  year: number | null;
  date_label: string | null;
  place_name: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  cover_image: HistoricalEvent["cover_image"];
  step_count: number;
};

export type OnThisDay = {
  /** The date asked for, MM-DD. */
  date: string;
  /** The date whose events are listed: the same, or the next one with events. MM-DD. */
  shown: string;
  /** Whether `shown` is a later date (no events on the date asked for). */
  next: boolean;
  events: PublicEventCard[];
};

/** A published event in full, for its own view (with its timeline for Phase 4). */
export type PublicEvent = Pick<
  HistoricalEvent,
  "slug" | "title" | "summary" | "narrative" | "event_year" | "event_month" | "event_day" | "date_precision" | "date_label" | "place_name" | "city" | "country" | "lat" | "lng" | "cover_image"
> & {
  kind: "person" | "event";
  /** The story's published "On this day" dates, each with its own title and the step it opens at (1-based). */
  dates: { md: string; year: number; title: string; summary: string | null; step: number | null }[];
  phases: PhaseT[];
  sources: Pick<EventSource, "id" | "title" | "url" | "author_or_publisher" | "published_on" | "source_type">[];
  steps: (Omit<TimelineStep, "event_id" | "created_at" | "updated_at" | "verified"> & {
    /** The place's own page (/place/<slug>), when it has one. */
    place_slug?: string;
  })[];
  /** The story's main place's page, when it has one. */
  place_slug?: string;
};

const withPage = (slug: string | undefined) => (slug ? { place_slug: slug } : {});

const pad = (n: number) => String(n).padStart(2, "0");
const md = (m: number, d: number) => `${pad(m)}-${pad(d)}`;

/** Inside the map's region (Bangladesh-only mode): events elsewhere aren't shown. */
const visible = (e: { lat?: number | null; lng?: number | null }) =>
  e.lat !== null && e.lat !== undefined && e.lng !== null && e.lng !== undefined && inRegion(e.lat, e.lng);

type AnniversaryRow = {
  date_id: string;
  event_id: string;
  slug: string;
  story_title: string;
  kind: "person" | "event";
  title: string;
  summary: string | null;
  year: number;
  step_id: string | null;
  place_name: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  cover_image: HistoricalEvent["cover_image"];
};

async function loadDay(month: number, day: number, year: number): Promise<OnThisDay> {
  const asked = md(month, day);
  const cards = async (m: number, d: number, y: number) => {
    const { data, error } = await db().rpc("anniversaries_on_day", { p_month: m, p_day: d, p_year: y });
    if (error) throw new Error(`Database: ${error.message}`);
    const rows = ((data ?? []) as AnniversaryRow[]).filter(visible);
    if (!rows.length) return [];
    // Each story's steps (ids in order): the count for the list, and which step a date opens at.
    const { data: steps } = await db()
      .from("historical_event_timeline_steps")
      .select("id,event_id,position")
      .in("event_id", [...new Set(rows.map((r) => r.event_id))])
      .order("position");
    const byEvent = new Map<string, string[]>();
    for (const s of steps ?? []) byEvent.set(s.event_id, [...(byEvent.get(s.event_id) ?? []), s.id]);
    return rows.map((r): PublicEventCard => {
      const ids = byEvent.get(r.event_id) ?? [];
      const at = r.step_id ? ids.indexOf(r.step_id) : -1;
      return {
        slug: r.slug,
        title: r.title,
        story_title: r.story_title,
        kind: r.kind,
        step: at >= 0 ? at + 1 : null,
        md: md(m, d),
        summary: r.summary ?? null,
        year: r.year,
        date_label: null,
        place_name: r.place_name ?? null,
        city: r.city ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        cover_image: r.cover_image ?? null,
        step_count: ids.length,
      };
    });
  };

  const today = await cards(month, day, year);
  if (today.length) return { date: asked, shown: asked, next: false, events: today };

  // Nothing that day: the next date with anniversaries (looking up to a year ahead).
  const { data: nextDate, error } = await db().rpc("next_anniversary_day", { p_month: month, p_day: day, p_year: year });
  if (error) throw new Error(`Database: ${error.message}`);
  if (!nextDate) return { date: asked, shown: asked, next: false, events: [] };
  const [y, m, d] = (nextDate as string).split("-").map(Number);
  const later = await cards(m, d, y);
  return { date: asked, shown: md(m, d), next: true, events: later };
}

/**
 * Published events for a date (default: today, Bangladesh time); when none, the next date with
 * events. Cached per date, cleared by any admin change that visitors could see.
 */
export function eventsOnDay(month: number, day: number, year: number): Promise<OnThisDay> {
  return unstable_cache(() => loadDay(month, day, year), ["events-on-day", String(year), String(month), String(day)], {
    tags: [EVENTS_CACHE_TAG],
    revalidate: 600,
  })();
}

async function loadEvent(slug: string): Promise<PublicEvent | null> {
  const { data: e, error } = await db().from("historical_events").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(`Database: ${error.message}`);
  if (!e || !visible(e)) return null;
  const [src, steps, dates, pages] = await Promise.all([
    db().from("historical_event_sources").select("id,title,url,author_or_publisher,published_on,source_type").eq("event_id", e.id).order("position"),
    db().from("historical_event_timeline_steps").select("*, historical_event_step_sources(source_id)").eq("event_id", e.id).order("position"),
    db().from("historical_event_dates").select("year,month,day,title,summary,step_id").eq("event_id", e.id).eq("status", "published").order("month").order("day"),
    listPageCandidates().catch(() => []),
  ]);
  if (src.error) throw new Error(`Database: ${src.error.message}`);
  type RawStep = TimelineStep & { historical_event_step_sources: { source_id: string }[] };
  const stepIds = ((steps.data ?? []) as RawStep[]).map((r) => r.id);
  type RawDate = { year: number; month: number; day: number; title: string; summary: string | null; step_id: string | null };
  return {
    slug: e.slug,
    kind: e.kind ?? "event",
    dates: ((dates.error ? [] : (dates.data ?? [])) as RawDate[]).map((d) => {
      const at = d.step_id ? stepIds.indexOf(d.step_id) : -1;
      return { md: md(d.month, d.day), year: d.year, title: d.title, summary: d.summary, step: at >= 0 ? at + 1 : null };
    }),
    title: e.title,
    summary: e.summary,
    narrative: e.narrative,
    event_year: e.event_year,
    event_month: e.event_month,
    event_day: e.event_day,
    date_precision: e.date_precision,
    date_label: e.date_label,
    place_name: e.place_name,
    city: e.city,
    country: e.country,
    lat: e.lat,
    lng: e.lng,
    cover_image: e.cover_image,
    ...withPage(findPlacePage(pages, { name: e.place_name, lat: e.lat, lng: e.lng })),
    phases: e.phases ?? [],
    sources: src.data ?? [],
    // Only what visitors need, field by field (never admin ids or the internal "verified" flag).
    steps: ((steps.data ?? []) as RawStep[]).map((r) => ({
      id: r.id,
      position: r.position,
      title: r.title,
      narrative: r.narrative,
      date_label: r.date_label,
      sort_minutes: r.sort_minutes,
      phase_id: r.phase_id,
      map_type: r.map_type,
      location_precision: r.location_precision,
      place_name: r.place_name,
      lat: r.lat,
      lng: r.lng,
      from_place_name: r.from_place_name,
      from_lat: r.from_lat,
      from_lng: r.from_lng,
      radius_m: r.radius_m,
      image: r.image,
      evidence: r.evidence,
      step_year: r.step_year ?? null,
      step_month: r.step_month ?? null,
      step_day: r.step_day ?? null,
      source_ids: r.historical_event_step_sources.map((l) => l.source_id),
      ...withPage(findPlacePage(pages, { name: r.place_name, lat: r.lat, lng: r.lng })),
    })),
  };
}

/** One published event by its slug (null if it doesn't exist, isn't published, or is outside the map's region). */
export function publicEvent(slug: string): Promise<PublicEvent | null> {
  return unstable_cache(() => loadEvent(slug), ["public-event", slug], { tags: [EVENTS_CACHE_TAG], revalidate: 600 })();
}

/** An event that happened at (or passed through) a place: for the place panel's "এখানে যা ঘটেছিল". */
export type EventNearby = {
  slug: string;
  title: string;
  year: number | null;
  date_label: string | null;
  /** What happened here: the step's own title when a timeline step is the nearby one. */
  here: string | null;
  /** The step to open at (1-based), when a timeline step is the nearby one. */
  step: number | null;
};

/** About 350 m around a place: its own events and timeline steps that passed through it. */
const NEAR = 0.0032;

async function loadNear(lat: number, lng: number): Promise<EventNearby[]> {
  const box = <T extends { gte: (c: string, v: number) => T; lte: (c: string, v: number) => T }>(q: T) =>
    q.gte("lat", lat - NEAR).lte("lat", lat + NEAR).gte("lng", lng - NEAR).lte("lng", lng + NEAR);
  const [own, steps] = await Promise.all([
    box(db().from("historical_events").select("id,slug,title,event_year,date_label").eq("status", "published")).limit(20),
    box(db().from("historical_event_timeline_steps").select("event_id,position,title")).neq("map_type", "none").limit(50),
  ]);
  if (own.error) throw new Error(`Database: ${own.error.message}`);
  if (steps.error) throw new Error(`Database: ${steps.error.message}`);
  type Ev = { id: string; slug: string; title: string; event_year: number | null; date_label: string | null };
  const byId = new Map<string, EventNearby & { id: string }>();
  for (const e of (own.data ?? []) as Ev[]) byId.set(e.id, { id: e.id, slug: e.slug, title: e.title, year: e.event_year, date_label: e.date_label, here: null, step: null });
  // Steps of other (published) events that took place here: the event, opened at that step.
  const stepRows = (steps.data ?? []) as { event_id: string; position: number; title: string }[];
  const others = [...new Set(stepRows.map((s) => s.event_id).filter((id) => !byId.has(id)))];
  if (others.length) {
    const [evs, all] = await Promise.all([
      db().from("historical_events").select("id,slug,title,event_year,date_label").eq("status", "published").in("id", others),
      db().from("historical_event_timeline_steps").select("event_id,position").in("event_id", others).order("position"),
    ]);
    const order = new Map<string, number[]>();
    for (const s of (all.data ?? []) as { event_id: string; position: number }[]) order.set(s.event_id, [...(order.get(s.event_id) ?? []), s.position]);
    for (const e of (evs.data ?? []) as Ev[]) {
      const s = stepRows.filter((x) => x.event_id === e.id).sort((a, b) => a.position - b.position)[0];
      const index = s ? (order.get(e.id) ?? []).indexOf(s.position) : -1;
      byId.set(e.id, { id: e.id, slug: e.slug, title: e.title, year: e.event_year, date_label: e.date_label, here: s?.title ?? null, step: index >= 0 ? index + 1 : null });
    }
  }
  return [...byId.values()]
    .map((e) => ({ slug: e.slug, title: e.title, year: e.year, date_label: e.date_label, here: e.here, step: e.step }))
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
    .slice(0, 12);
}

/** Published events at or through this spot, oldest first (cached; cleared with the other event caches). */
export function eventsNear(lat: number, lng: number): Promise<EventNearby[]> {
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return unstable_cache(() => loadNear(r(lat), r(lng)), ["events-near", String(r(lat)), String(r(lng))], { tags: [EVENTS_CACHE_TAG], revalidate: 3600 })();
}
