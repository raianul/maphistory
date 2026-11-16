/**
 * Accepting and rejecting parts of a research run. Accepted content is COPIED into the event as an
 * editable, unverified draft through the existing event/source/step helpers; the AI never decides
 * anything here, the admin does. Rules:
 *   - Nothing accepted is ever verified (sources and steps go in with verified = false).
 *   - Event text is only filled when empty; replacing existing text needs an explicit replace flag
 *     (the admin has seen both versions).
 *   - A step is not added twice: neither the same suggestion again, nor one whose title matches an
 *     existing step.
 *   - Sources: only RETRIEVED ones (never leads); a URL already on the event is reused.
 *   - Published events can't receive drafts (unpublish first): public content never gains
 *     unverified material.
 * Every decision is recorded on the run. Server-side only.
 */
import { addSource, addStep, getEvent, setPhases, updateEvent, type EventBundle } from "../events/db";
import { EventFields, PHASE_COLORS, StepFields, type PhaseColor, type PhaseT } from "../events/schema";
import { db } from "../db";
import { getRun } from "./run";
import type { ResearchRun, ResearchSource } from "./types";

export class AcceptError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

async function record(run: ResearchRun, key: string, state: "accepted" | "rejected", targetId?: string, also: Record<string, string> = {}): Promise<void> {
  const at = new Date().toISOString();
  const decisions = { ...run.decisions };
  // Sources linked along with a step count as accepted too (so the list shows them as added).
  for (const [k, id] of Object.entries(also)) decisions[k] = { state: "accepted", at, target_id: id };
  decisions[key] = { state, at, ...(targetId ? { target_id: targetId } : {}) };
  const { error } = await db().from("historical_event_research").update({ decisions }).eq("id", run.id);
  if (error) throw new Error(`Database: ${error.message}`);
}

/** Adds a retrieved research source to the event (or finds it already there). Never verified. */
async function ensureSource(bundle: EventBundle, src: ResearchSource, userId: string, note?: string): Promise<string> {
  if (src.retrieval !== "retrieved") throw new AcceptError(`${src.id} could not be retrieved; it can't be added as evidence`, 400);
  const existing = bundle.sources.find((s) => s.url && norm(s.url) === norm(src.url));
  if (existing) return existing.id;
  const added = await addSource(
    bundle.event.id,
    {
      title: src.title,
      url: src.url,
      author_or_publisher: [src.author, src.publisher].filter(Boolean).join(" · ") || null,
      published_on: src.published_on,
      source_type: src.source_type === "academic" ? "academic" : src.source_type === "government" ? "government" : src.source_type === "encyclopedia" ? "encyclopedia" : "article",
      notes: note ?? `AI গবেষণায় সংগৃহীত (${new Date(src.retrieved_at).toISOString().slice(0, 10)})`,
      verified: false, // only an admin verifies, by editing the source after checking it
      evidence_quote: null,
    },
    userId,
  );
  // Mark where it came from: an AI suggestion, unless the admin pasted the URL themselves.
  if (src.origin === "wikipedia") await db().from("historical_event_sources").update({ origin: "ai_suggestion" }).eq("id", added.id);
  bundle.sources.push({ ...added, origin: src.origin === "wikipedia" ? "ai_suggestion" : "editor" });
  return added.id;
}

export type Decision =
  | { kind: "reject"; key: string }
  | { kind: "source"; source_id: string }
  | { kind: "overview"; field: "summary" | "narrative"; text: string; replace?: boolean }
  | { kind: "phases" }
  | { kind: "step"; index: number; fields: unknown };

/** Applies one admin decision to an event from a research run. */
export async function decide(eventId: string, runId: string, d: Decision, userId: string): Promise<void> {
  const run = await getRun(eventId, runId);
  if (!run) throw new AcceptError("Research run not found", 404);
  const bundle = await getEvent(eventId);
  if (!bundle) throw new AcceptError("Event not found", 404);

  if (d.kind === "reject") return record(run, d.key, "rejected");

  if (bundle.event.status === "published") throw new AcceptError("Can't add draft content to a published event; unpublish it first.");
  if (!run.draft && d.kind !== "source") throw new AcceptError("This research run has no draft", 400);

  if (d.kind === "source") {
    const src = run.sources.find((s) => s.id === d.source_id);
    if (!src) throw new AcceptError("That source isn't in this research run", 400);
    const id = await ensureSource(bundle, src, userId, run.draft?.source_notes[src.id]);
    return record(run, `source.${src.id}`, "accepted", id);
  }

  if (d.kind === "overview") {
    const current = bundle.event[d.field];
    if (current && current.trim() && !d.replace) {
      throw new AcceptError("This field already has text. Compare the old and new text before replacing it.");
    }
    const text = d.text.trim();
    if (!text) throw new AcceptError("Text is empty", 400);
    // Only the event's editable fields (status, ids and timestamps are never touched here).
    const e = bundle.event;
    const fields = {
      slug: e.slug, title: e.title, summary: e.summary, narrative: e.narrative, language: e.language,
      event_year: e.event_year, event_month: e.event_month, event_day: e.event_day, date_precision: e.date_precision,
      date_label: e.date_label, recurring: e.recurring, place_name: e.place_name, city: e.city, country: e.country ?? "",
      lat: e.lat, lng: e.lng, cover_image: e.cover_image,
    };
    const parsed = EventFields.safeParse({ ...fields, [d.field]: text });
    if (!parsed.success) throw new AcceptError(parsed.error.issues[0]?.message ?? "Invalid text", 400);
    await updateEvent(eventId, parsed.data, userId);
    await db().from("historical_events").update({ ai_assisted: true }).eq("id", eventId);
    return record(run, `overview.${d.field}`, "accepted");
  }

  if (d.kind === "phases") {
    const existing = bundle.event.phases ?? [];
    const have = new Set(existing.map((p) => p.id));
    const used = new Set(existing.map((p) => p.color));
    const free = PHASE_COLORS.filter((c) => !used.has(c));
    const add: PhaseT[] = [];
    for (const p of run.draft!.phases) {
      if (have.has(p.id) || existing.length + add.length >= 4 || !free.length) continue;
      add.push({ id: p.id, label: p.label, color: free.shift() as PhaseColor });
    }
    if (!add.length) throw new AcceptError("No room for new phases (max 4), or they all exist already");
    await setPhases(eventId, [...existing, ...add], userId);
    return record(run, "phases", "accepted");
  }

  // A timeline step, as edited by the admin in the review form.
  const suggestion = run.draft!.steps[d.index];
  if (!suggestion) throw new AcceptError("That step isn't in this research run", 400);
  const key = `step.${d.index}`;
  if (run.decisions[key]?.state === "accepted") throw new AcceptError("This suggested step was already added");
  const parsed = StepFields.safeParse({ ...(d.fields as object), verified: false, source_ids: [] });
  if (!parsed.success) throw new AcceptError(parsed.error.issues[0]?.message ?? "Invalid step data", 400);
  if (bundle.steps.some((s) => norm(s.title) === norm(parsed.data.title))) {
    throw new AcceptError(`A step named "${parsed.data.title}" already exists; change the title or edit that step`);
  }
  // The step cites the retrieved sources its claims were checked against (added to the event if new).
  const citedIds = [...new Set(suggestion.citations.filter((c) => c.found).map((c) => c.source_id))];
  const sourceIds: string[] = [];
  const linked: Record<string, string> = {};
  for (const sid of citedIds) {
    const src = run.sources.find((s) => s.id === sid);
    if (!src) continue;
    const id = await ensureSource(bundle, src, userId, run.draft!.source_notes[sid]);
    sourceIds.push(id);
    linked[`source.${sid}`] = id;
  }
  if (parsed.data.phase_id && !(bundle.event.phases ?? []).some((p) => p.id === parsed.data.phase_id)) parsed.data.phase_id = null;
  await addStep(eventId, { ...parsed.data, verified: false, source_ids: sourceIds }, userId);
  await db().from("historical_events").update({ ai_assisted: true }).eq("id", eventId);
  const fresh = await getEvent(eventId);
  const added = fresh?.steps.find((s) => norm(s.title) === norm(parsed.data.title));
  return record(run, key, "accepted", added?.id, linked);
}
