/**
 * Historical events in Supabase (admin side). Server-side only: uses the secret key through db(),
 * so every caller must have passed requireAdmin first. Input is validated by lib/events/schema.ts
 * before it gets here.
 */
import { db } from "../db";
import { publishProblems } from "./schema";
import type { EventFieldsT, EventListRow, EventSource, EventStatus, HistoricalEvent, PhaseT, SourceFieldsT, StepFieldsT, TimelineStep } from "./schema";

export type { EventListRow };

/** The tables don't exist until the historical_events migration has been run. */
const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";
export const MIGRATION_MISSING = "The historical events table doesn't exist yet: run the historical_events migration in Supabase.";

function fail(error: { code?: string; message: string }): never {
  if (missingTable(error.code)) throw new Error(MIGRATION_MISSING);
  if (error.code === "23505") throw new Error("This slug already exists; choose another.");
  if (error.code === "23514") throw new Error(`Data breaks a database rule (${error.message})`);
  throw new Error(`Database: ${error.message}`);
}

export type EventListFilters = {
  q?: string;
  status?: EventStatus;
  month?: number;
  day?: number;
  country?: string;
};


/** Events for the admin list, most recently changed first, with how many sources each has. */
export async function listEvents(f: EventListFilters = {}): Promise<EventListRow[]> {
  let q = db()
    .from("historical_events")
    .select(
      "id,slug,title,status,event_year,event_month,event_day,date_precision,date_label,recurring,place_name,city,country,updated_at,published_at,historical_event_sources(count)",
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  if (f.status) q = q.eq("status", f.status);
  if (f.month) q = q.eq("event_month", f.month);
  if (f.day) q = q.eq("event_day", f.day);
  if (f.country) q = q.eq("country", f.country.toUpperCase());
  if (f.q?.trim()) {
    // Title, place or city; commas and brackets would break PostgREST's or() syntax.
    const term = f.q.trim().replace(/[,()%*]/g, " ").slice(0, 100);
    q = q.or(`title.ilike.%${term}%,place_name.ilike.%${term}%,city.ilike.%${term}%,slug.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) fail(error);
  type Raw = Omit<EventListRow, "source_count"> & { historical_event_sources: { count: number }[] };
  return (data as unknown as Raw[]).map(({ historical_event_sources, ...r }) => ({ ...r, source_count: historical_event_sources[0]?.count ?? 0 }));
}

export type EventBundle = { event: HistoricalEvent; sources: EventSource[]; steps: TimelineStep[] };

/** What every admin event route answers with: the whole event and what still blocks publishing. */
export function withProblems(b: EventBundle) {
  return { ...b, problems: publishProblems(b.event, b.sources, b.steps) };
}

/** An event with its sources and its timeline steps (each with the ids of the sources it cites). */
export async function getEvent(id: string): Promise<EventBundle | undefined> {
  const [ev, src, steps] = await Promise.all([
    db().from("historical_events").select("*").eq("id", id).maybeSingle(),
    db().from("historical_event_sources").select("*").eq("event_id", id).order("position").order("created_at"),
    db().from("historical_event_timeline_steps").select("*, historical_event_step_sources(source_id)").eq("event_id", id).order("position"),
  ]);
  if (ev.error) fail(ev.error);
  if (src.error) fail(src.error);
  if (!ev.data) return undefined;
  // Before the Phase 2 migration there are no steps (and no phases column): carry on without them.
  let stepRows: TimelineStep[] = [];
  if (steps.error) {
    if (!missingTable(steps.error.code)) fail(steps.error);
  } else {
    type Raw = Omit<TimelineStep, "source_ids"> & { historical_event_step_sources: { source_id: string }[] };
    stepRows = (steps.data as Raw[]).map(({ historical_event_step_sources, ...r }) => ({ ...r, source_ids: historical_event_step_sources.map((l) => l.source_id) }));
  }
  const event = { phases: [], ...ev.data } as HistoricalEvent;
  return { event, sources: (src.data ?? []) as EventSource[], steps: stepRows };
}

export async function createEvent(fields: EventFieldsT, userId: string): Promise<HistoricalEvent> {
  const { data, error } = await db()
    .from("historical_events")
    .insert({ ...fields, status: "draft", created_by: userId, updated_by: userId })
    .select("*")
    .single();
  if (error) fail(error);
  return data as HistoricalEvent;
}

export async function updateEvent(id: string, fields: EventFieldsT, userId: string): Promise<HistoricalEvent> {
  const { data, error } = await db()
    .from("historical_events")
    .update({ ...fields, updated_by: userId })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error("Event not found");
  return data as HistoricalEvent;
}

/** Changes status. Publishing records the first publication time (kept if republished later). */
export async function setEventStatus(current: HistoricalEvent, to: EventStatus, userId: string): Promise<HistoricalEvent> {
  const patch: Record<string, unknown> = { status: to, updated_by: userId };
  if (to === "published" && !current.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await db().from("historical_events").update(patch).eq("id", current.id).select("*").single();
  if (error) fail(error);
  return data as HistoricalEvent;
}

/** Marks all of an event's sources and steps verified (done when an admin publishes it). */
export async function verifyAll(eventId: string, userId: string): Promise<void> {
  const a = await db().from("historical_event_sources").update({ verified: true }).eq("event_id", eventId).eq("verified", false);
  if (a.error) fail(a.error);
  const b = await db().from("historical_event_timeline_steps").update({ verified: true, updated_by: userId }).eq("event_id", eventId).eq("verified", false);
  if (b.error) fail(b.error);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await db().from("historical_events").delete().eq("id", id);
  if (error) fail(error);
}

// ── Sources ─────────────────────────────────────────────────────────────────────────────

export async function addSource(eventId: string, fields: SourceFieldsT, userId: string): Promise<EventSource> {
  const { count } = await db().from("historical_event_sources").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  const { data, error } = await db()
    .from("historical_event_sources")
    .insert({ ...fields, event_id: eventId, origin: "editor", position: fields.position ?? count ?? 0, created_by: userId })
    .select("*")
    .single();
  if (error) fail(error);
  return data as EventSource;
}

export async function updateSource(eventId: string, sourceId: string, fields: SourceFieldsT): Promise<EventSource> {
  const { data, error } = await db()
    .from("historical_event_sources")
    .update(fields)
    .eq("id", sourceId)
    .eq("event_id", eventId)
    .select("*")
    .maybeSingle();
  if (error) fail(error);
  if (!data) throw new Error("Source not found");
  return data as EventSource;
}

export async function deleteSource(eventId: string, sourceId: string): Promise<void> {
  const { error } = await db().from("historical_event_sources").delete().eq("id", sourceId).eq("event_id", eventId);
  if (error) fail(error);
}

/** Records that an event changed (used by the status and source routes, so its updated_at moves). */
export async function touchEvent(id: string, userId: string): Promise<void> {
  const { error } = await db().from("historical_events").update({ updated_by: userId }).eq("id", id);
  if (error) fail(error);
}

// ── Phases and timeline steps (Phase 2) ───────────────────────────────────────────────────

export const TIMELINE_MIGRATION_MISSING = "The timeline table doesn't exist yet: run the event_timeline migration in Supabase.";

function failTimeline(error: { code?: string; message: string }): never {
  if (missingTable(error.code) || error.code === "42703" || error.code === "PGRST204") throw new Error(TIMELINE_MIGRATION_MISSING);
  fail(error);
}

/** Replaces the event's phases. Steps whose phase was removed are left without one (the checklist flags them). */
export async function setPhases(eventId: string, phases: PhaseT[], userId: string): Promise<void> {
  const { error } = await db().from("historical_events").update({ phases, updated_by: userId }).eq("id", eventId);
  if (error) failTimeline(error);
  const kept = phases.map((p) => p.id);
  let q = db().from("historical_event_timeline_steps").update({ phase_id: null }).eq("event_id", eventId).not("phase_id", "is", null);
  if (kept.length) q = q.not("phase_id", "in", `(${kept.join(",")})`);
  const res = await q;
  if (res.error) failTimeline(res.error);
}

/** The step's columns (everything but the source links). */
function stepColumns(fields: StepFieldsT): Omit<StepFieldsT, "source_ids"> {
  const rest: Partial<StepFieldsT> = { ...fields };
  delete rest.source_ids;
  return rest as Omit<StepFieldsT, "source_ids">;
}

/** Replaces which sources back a step. Only the event's own sources (the database enforces it too). */
async function setStepSources(eventId: string, stepId: string, sourceIds: string[]): Promise<void> {
  const del = await db().from("historical_event_step_sources").delete().eq("step_id", stepId);
  if (del.error) failTimeline(del.error);
  if (!sourceIds.length) return;
  const ins = await db()
    .from("historical_event_step_sources")
    .insert([...new Set(sourceIds)].map((source_id) => ({ step_id: stepId, source_id, event_id: eventId })));
  if (ins.error) {
    if (ins.error.code === "23503") throw new Error("Can't attach a source that doesn't belong to this event");
    failTimeline(ins.error);
  }
}

/** Adds a step at the end of the timeline. */
export async function addStep(eventId: string, fields: StepFieldsT, userId: string): Promise<void> {
  const { count, error: cErr } = await db().from("historical_event_timeline_steps").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if (cErr) failTimeline(cErr);
  const { data, error } = await db()
    .from("historical_event_timeline_steps")
    .insert({ ...stepColumns(fields), verified: false, event_id: eventId, position: count ?? 0, created_by: userId, updated_by: userId })
    .select("id")
    .single();
  if (error) failTimeline(error);
  await setStepSources(eventId, data.id, fields.source_ids);
  // Verified only once its sources are linked (the order matters: the link comes first).
  if (fields.verified) {
    const v = await db().from("historical_event_timeline_steps").update({ verified: true }).eq("id", data.id);
    if (v.error) failTimeline(v.error);
  }
}

export async function updateStep(eventId: string, stepId: string, fields: StepFieldsT, userId: string): Promise<void> {
  // Sources first, so a step is never stored as verified without them.
  await setStepSources(eventId, stepId, fields.source_ids);
  const { data, error } = await db()
    .from("historical_event_timeline_steps")
    .update({ ...stepColumns(fields), updated_by: userId })
    .eq("id", stepId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle();
  if (error) failTimeline(error);
  if (!data) throw new Error("Step not found");
}

/** Deletes a step and closes the gap in the order (positions stay 0..n-1). */
export async function deleteStep(eventId: string, stepId: string): Promise<void> {
  const { error } = await db().from("historical_event_timeline_steps").delete().eq("id", stepId).eq("event_id", eventId);
  if (error) failTimeline(error);
  const { data, error: e2 } = await db().from("historical_event_timeline_steps").select("id").eq("event_id", eventId).order("position");
  if (e2) failTimeline(e2);
  if (data.length) await reorderSteps(eventId, data.map((r) => r.id));
}

/** Sets the whole order at once (one transaction in the database: positions become 0..n-1). */
export async function reorderSteps(eventId: string, stepIds: string[]): Promise<void> {
  const { error } = await db().rpc("reorder_event_steps", { p_event_id: eventId, p_step_ids: stepIds });
  if (error) {
    if (error.code === "22023") throw new Error("The step list is out of date; reload the page and try again");
    failTimeline(error);
  }
}
