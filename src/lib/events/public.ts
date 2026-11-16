/**
 * Historical events for visitors (the public map): only published events, only inside the map's
 * region, read through Next's server cache (tag EVENTS_CACHE_TAG). Every admin change that could
 * affect visitors clears that tag (lib/events/cache.ts), so an unpublished event is never served
 * from cache. Server-side only.
 */
import { unstable_cache } from "next/cache";
import { db } from "../db";
import { inRegion } from "../region";
import { EVENTS_CACHE_TAG } from "./cache";
import type { EventSource, HistoricalEvent, PhaseT, TimelineStep } from "./schema";

/** What the "On this day" list shows for one event. */
export type PublicEventCard = {
  slug: string;
  title: string;
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
  phases: PhaseT[];
  sources: Pick<EventSource, "id" | "title" | "url" | "author_or_publisher" | "published_on" | "source_type">[];
  steps: Omit<TimelineStep, "event_id" | "created_at" | "updated_at" | "verified">[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const md = (m: number, d: number) => `${pad(m)}-${pad(d)}`;

/** Inside the map's region (Bangladesh-only mode): events elsewhere aren't shown. */
const visible = (e: { lat?: number | null; lng?: number | null }) =>
  e.lat !== null && e.lat !== undefined && e.lng !== null && e.lng !== undefined && inRegion(e.lat, e.lng);

async function loadDay(month: number, day: number, year: number): Promise<OnThisDay> {
  const asked = md(month, day);
  const cards = async (m: number, d: number, y: number) => {
    const { data, error } = await db().rpc("events_on_day", { p_month: m, p_day: d, p_year: y });
    if (error) throw new Error(`Database: ${error.message}`);
    const rows = (data ?? []) as HistoricalEvent[];
    const shown = rows.filter(visible);
    if (!shown.length) return [];
    // How many timeline steps each has (a hint in the list: "৮ ধাপ").
    const { data: counts } = await db()
      .from("historical_event_timeline_steps")
      .select("event_id")
      .in(
        "event_id",
        shown.map((r) => r.id),
      );
    const n = new Map<string, number>();
    for (const c of counts ?? []) n.set(c.event_id, (n.get(c.event_id) ?? 0) + 1);
    return shown.map(
      (r): PublicEventCard => ({
        slug: r.slug,
        title: r.title,
        summary: r.summary ?? null,
        year: r.event_year ?? null,
        date_label: r.date_label ?? null,
        place_name: r.place_name ?? null,
        city: r.city ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        cover_image: r.cover_image ?? null,
        step_count: n.get(r.id) ?? 0,
      }),
    );
  };

  const today = await cards(month, day, year);
  if (today.length) return { date: asked, shown: asked, next: false, events: today };

  // Nothing that day: the next date with events (looking up to a year ahead).
  const { data: nextDate, error } = await db().rpc("next_event_day", { p_month: month, p_day: day, p_year: year });
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
  const [src, steps] = await Promise.all([
    db().from("historical_event_sources").select("id,title,url,author_or_publisher,published_on,source_type").eq("event_id", e.id).order("position"),
    db().from("historical_event_timeline_steps").select("*, historical_event_step_sources(source_id)").eq("event_id", e.id).order("position"),
  ]);
  if (src.error) throw new Error(`Database: ${src.error.message}`);
  type RawStep = TimelineStep & { historical_event_step_sources: { source_id: string }[] };
  return {
    slug: e.slug,
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
      source_ids: r.historical_event_step_sources.map((l) => l.source_id),
    })),
  };
}

/** One published event by its slug (null if it doesn't exist, isn't published, or is outside the map's region). */
export function publicEvent(slug: string): Promise<PublicEvent | null> {
  return unstable_cache(() => loadEvent(slug), ["public-event", slug], { tags: [EVENTS_CACHE_TAG], revalidate: 600 })();
}
