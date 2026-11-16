"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DATE_PRECISIONS,
  SOURCE_TYPE_EN,
  SOURCE_TYPES,
  STATUS_EN,
  TRANSITIONS,
  type EventSource,
  type EventStatus,
  type HistoricalEvent,
  type TimelineStep,
} from "@/lib/events/schema";
import { adminFetch } from "@/lib/supabase-browser";
import { ImagePicker } from "./ImagePicker";
import { MapPicker } from "./MapPicker";
import { dateBn, StatusBadge } from "./shared";
import { ResearchPanel } from "./ResearchPanel";
import { TimelinePanel } from "./TimelinePanel";

type Loaded = { event: HistoricalEvent; sources: EventSource[]; steps: TimelineStep[]; problems: string[] };

const field =
  "w-full rounded-control border border-line-strong bg-card px-3 py-2 text-meta outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-ring";
const label = "grid gap-1 text-meta font-semibold text-ink-2";
const section = "rounded-2xl bg-card p-4 shadow-float md:p-5";
const btn = "h-10 rounded-full px-4 text-meta font-semibold transition-colors disabled:opacity-50";

const PRECISION_EN: Record<(typeof DATE_PRECISIONS)[number], string> = {
  day: "Exact day",
  month: "Month and year only",
  year: "Year only",
  approximate: "Approximate",
};

/** Words for each move between statuses, as buttons. */
const MOVE_EN: Partial<Record<EventStatus, string>> = {
  draft: "Back to draft",
  research: "Send to research",
  review: "Send to review",
  published: "Verify and publish",
  archived: "Archive",
};

/** /admin/events/[id]: an event's basic information, its sources, and its status. */
export function EventEditor({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch(`/api/admin/events/${id}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) setData(d);
      else setError(d.error ?? `HTTP ${r.status}`);
    });
  }, [id]);

  if (!data) return <p className="p-8 text-muted">{error ?? "Loading…"}</p>;
  const { event } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap gap-3 text-meta">
        <Link href={`/admin/events/${id}/preview`} className="font-semibold text-accent hover:underline">
          ← Preview and publish
        </Link>
        <Link href="/admin/events" className="text-muted hover:text-ink">
          All events
        </Link>
      </div>
      <header className="mt-2 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-display font-bold tracking-tight">{event.title}</h1>
          <p className="mt-1 text-meta text-muted">
            {dateBn(event)} · /{event.slug}
            {event.published_at && ` · First published ${new Date(event.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
          </p>
        </div>
        <StatusBadge status={event.status} />
      </header>

      <StatusPanel data={data} onChange={setData} />
      {/* Keyed by id only: saving must not throw the form away (and its "saved" note with it). */}
      <BasicsForm key={event.id} event={event} onSaved={setData} />
      <SourcesPanel data={data} onChange={setData} />
      <TimelinePanel data={data} onChange={setData} />
      {/* Detailed AI research (claim by claim): rarely needed now that drafts are generated. */}
      <details className="mt-5 rounded-2xl bg-card shadow-float">
        <summary className="cursor-pointer p-4 text-meta font-semibold text-ink-2 select-none md:px-5">Advanced: detailed AI research</summary>
        <div className="px-0 pb-1 [&>section]:mt-0 [&>section]:shadow-none">
          <ResearchPanel data={data} onChange={setData} />
        </div>
      </details>
    </div>
  );
}

// ── Status and publish checklist ──────────────────────────────────────────────────────────

function StatusPanel({ data, onChange }: { data: Loaded; onChange: (d: Loaded) => void }) {
  const { event, problems } = data;
  const [busy, setBusy] = useState<EventStatus | null>(null);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  async function move(to: EventStatus) {
    setBusy(to);
    setError(null);
    const r = await adminFetch(`/api/admin/events/${event.id}/status`, { method: "POST", body: JSON.stringify({ to }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setError({ message: d.error ?? `HTTP ${r.status}`, problems: d.problems });
    onChange(d);
  }

  async function remove() {
    const r = await adminFetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError({ message: d.error ?? `HTTP ${r.status}` });
    router.push("/admin/events");
  }

  const moves = TRANSITIONS[event.status];
  return (
    <section className={`${section} mt-5`} aria-label="Status">
      <h2 className="font-semibold">Status: {STATUS_EN[event.status]}</h2>
      <p className="mt-1 text-meta text-muted">
        Visitors only see published events. Publishing means you have checked it: all sources and steps will be marked as verified. Unpublishing removes it right away.
      </p>

      {event.status !== "published" && (
        <div className="mt-3 rounded-control bg-paper p-3">
          <p className="text-meta font-semibold">{problems.length ? "Before publishing:" : "✓ Ready to publish"}</p>
          {problems.length > 0 && (
            <ul className="mt-1 grid gap-0.5 text-meta text-warning">
              {problems.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {moves.map((to) => {
          const primary = to === "published";
          const blocked = primary && problems.length > 0;
          return (
            <button
              key={to}
              type="button"
              disabled={!!busy || blocked}
              onClick={() => move(to)}
              title={blocked ? "The checklist isn’t complete" : undefined}
              className={`${btn} ${primary ? "bg-accent text-on-accent hover:bg-accent-hover" : event.status === "published" && to === "review" ? "bg-warning-soft text-warning hover:bg-warning-soft-hover" : "bg-hover text-ink-2 hover:bg-pressed"}`}
            >
              {busy === to ? "…" : event.status === "published" && to === "review" ? "Unpublish" : MOVE_EN[to]}
            </button>
          );
        })}
        {(event.status === "draft" || event.status === "archived") &&
          (confirmDelete ? (
            <span className="flex items-center gap-2">
              <button type="button" onClick={remove} className={`${btn} bg-danger text-white`}>
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={`${btn} text-muted`}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={`${btn} ms-auto text-danger hover:bg-hover`}>
              Delete
            </button>
          ))}
      </div>
      {error && (
        <div role="alert" className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          <p className="font-semibold">{error.message}</p>
          {error.problems?.map((p) => <p key={p}>• {p}</p>)}
        </div>
      )}
    </section>
  );
}

// ── Basic information ─────────────────────────────────────────────────────────────────────

function BasicsForm({ event, onSaved }: { event: HistoricalEvent; onSaved: (d: Loaded) => void }) {
  const [f, setF] = useState(() => ({ ...event }));
  // The event changed elsewhere (status, sources) while the form had no unsaved edits: show it.
  const [seen, setSeen] = useState(event.updated_at);
  const [dirty, setDirty] = useState(false);
  if (event.updated_at !== seen) {
    setSeen(event.updated_at);
    if (!dirty) setF({ ...event });
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; problems?: string[]; issues?: { path: string[]; message: string }[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof HistoricalEvent>(k: K, v: HistoricalEvent[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setSaved(false);
    setDirty(true);
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const text = (v: string) => (v.trim() === "" ? null : v);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      slug: f.slug,
      title: f.title,
      summary: f.summary,
      narrative: f.narrative,
      language: f.language,
      event_year: f.event_year,
      event_month: f.date_precision === "year" || f.date_precision === "approximate" ? (f.date_precision === "approximate" ? f.event_month : null) : f.event_month,
      event_day: f.date_precision === "day" || f.date_precision === "approximate" ? f.event_day : null,
      date_precision: f.date_precision,
      date_label: f.date_label,
      recurring: f.date_precision === "day" ? f.recurring : false,
      place_name: f.place_name,
      city: f.city,
      country: f.country ?? "",
      lat: f.lat,
      lng: f.lng,
      cover_image: f.cover_image ?? null,
    };
    const r = await adminFetch(`/api/admin/events/${event.id}`, { method: "PUT", body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) return setError({ message: d.error ?? `HTTP ${r.status}`, problems: d.problems, issues: d.issues });
    setSaved(true);
    setDirty(false);
    setF({ ...d.event });
    setSeen(d.event.updated_at);
    onSaved(d);
  }

  const issueFor = (k: string) => error?.issues?.find((i) => i.path[0] === k)?.message;

  return (
    <form onSubmit={save} className={`${section} mt-5 grid gap-4`} aria-label="Basic information">
      <h2 className="font-semibold">Basic information</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={label}>
          Title
          <input required value={f.title} onChange={(e) => set("title", e.target.value)} className={field} />
          <FieldError message={issueFor("title")} />
        </label>
        <label className={label}>
          Slug
          <input required value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} className={field} />
          <FieldError message={issueFor("slug")} />
        </label>
      </div>

      <label className={label}>
        Short summary (shown in lists, up to 600 characters)
        <textarea rows={2} maxLength={600} value={f.summary ?? ""} onChange={(e) => set("summary", text(e.target.value))} className={field} />
      </label>
      <label className={label}>
        Full historical account
        <textarea rows={8} maxLength={20000} value={f.narrative ?? ""} onChange={(e) => set("narrative", text(e.target.value))} className={field} />
      </label>

      <fieldset className="grid gap-3 rounded-control border border-line p-3">
        <legend className="px-1 text-meta font-semibold text-ink-2">Event date (not the publishing date)</legend>
        <div className="grid gap-3 md:grid-cols-4">
          <label className={label}>
            Precision
            <select value={f.date_precision} onChange={(e) => set("date_precision", e.target.value as HistoricalEvent["date_precision"])} className={field}>
              {DATE_PRECISIONS.map((p) => (
                <option key={p} value={p}>
                  {PRECISION_EN[p]}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Year
            <input type="number" value={f.event_year ?? ""} onChange={(e) => set("event_year", num(e.target.value))} className={field} placeholder="1952" />
            <FieldError message={issueFor("event_year")} />
          </label>
          <label className={label}>
            Month (1–12)
            <input
              type="number"
              min={1}
              max={12}
              disabled={f.date_precision === "year"}
              value={f.date_precision === "year" ? "" : (f.event_month ?? "")}
              onChange={(e) => set("event_month", num(e.target.value))}
              className={field}
            />
            <FieldError message={issueFor("event_month")} />
          </label>
          <label className={label}>
            Day
            <input
              type="number"
              min={1}
              max={31}
              disabled={f.date_precision === "year" || f.date_precision === "month"}
              value={f.date_precision === "year" || f.date_precision === "month" ? "" : (f.event_day ?? "")}
              onChange={(e) => set("event_day", num(e.target.value))}
              className={field}
            />
            <FieldError message={issueFor("event_day")} />
          </label>
        </div>
        <label className={label}>
          Date description {f.date_precision === "approximate" ? "(required)" : "(optional, e.g. ভোররাতে)"}
          <input value={f.date_label ?? ""} onChange={(e) => set("date_label", text(e.target.value))} className={field} placeholder="e.g. আনুমানিক ১৭৫৭" />
          <FieldError message={issueFor("date_label")} />
        </label>
        <label className="flex items-start gap-2 text-meta">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--accent)]"
            disabled={f.date_precision !== "day"}
            checked={f.date_precision === "day" && f.recurring}
            onChange={(e) => set("recurring", e.target.checked)}
          />
          <span>
            <span className="font-semibold">Show every year in &ldquo;On this day&rdquo;</span>
            <span className="block text-muted">
              {f.date_precision === "day" ? "When off, it shows only on that day in the event’s own year." : "Only events with an exact day can show every year."}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="grid gap-3 rounded-control border border-line p-3">
        <legend className="px-1 text-meta font-semibold text-ink-2">Main place</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <label className={label}>
            Place name
            <input value={f.place_name ?? ""} onChange={(e) => set("place_name", text(e.target.value))} className={field} placeholder="e.g. ঢাকা মেডিকেল কলেজ" />
          </label>
          <label className={label}>
            City
            <input value={f.city ?? ""} onChange={(e) => set("city", text(e.target.value))} className={field} placeholder="e.g. ঢাকা" />
          </label>
          <label className={label}>
            Country (code)
            <input value={f.country ?? ""} maxLength={2} onChange={(e) => set("country", text(e.target.value.toUpperCase()))} className={`${field} uppercase`} placeholder="BD" />
            <FieldError message={issueFor("country")} />
          </label>
        </div>
        <MapPicker
          mode="marker"
          to={f.lat !== null && f.lat !== undefined ? { name: f.place_name ?? null, lat: f.lat, lng: f.lng! } : null}
          color="#6b5b95"
          onChange={(v) => {
            if (!v.to) return;
            set("lat", v.to.lat);
            set("lng", v.to.lng);
            // Fill the place name from the map only if the editor hasn't written one.
            if (!f.place_name && v.to.name) set("place_name", v.to.name);
          }}
        />
        <FieldError message={issueFor("lat")} />
      </fieldset>

      <div className={label}>
        Cover image (optional, Wikimedia Commons only)
        <ImagePicker
          value={f.cover_image}
          near={f.lat !== null && f.lat !== undefined ? { lat: f.lat, lng: f.lng! } : null}
          onChange={(v) => set("cover_image", v)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}>
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-meta text-success">✓ Saved</span>}
        {error && (
          <span role="alert" className="text-meta text-danger">
            {error.message}
            {error.problems?.map((p) => ` · ${p}`)}
          </span>
        )}
      </div>
    </form>
  );
}

/** A field's validation message, under the field. */
function FieldError({ message }: { message?: string }) {
  return message ? <span className="text-micro font-normal text-danger">{message}</span> : null;
}

// ── Sources ───────────────────────────────────────────────────────────────────────────────

function SourcesPanel({ data, onChange }: { data: Loaded; onChange: (d: Loaded) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className={`${section} mt-5`} aria-label="Sources">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Sources ({data.sources.length})</h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${btn} ms-auto bg-accent-soft text-accent hover:bg-accent-soft-hover`}>
            + Add source
          </button>
        )}
      </div>
      <p className="mt-1 text-meta text-muted">Back every fact with at least one source. Mark it &ldquo;verified&rdquo; only after you have checked it yourself.</p>
      {adding && <SourceForm eventId={data.event.id} onDone={(d) => (d && onChange(d), setAdding(false))} />}
      <ul className="mt-3 grid gap-2">
        {data.sources.map((s) => (
          <SourceRow key={s.id} eventId={data.event.id} source={s} onChange={onChange} />
        ))}
        {!data.sources.length && !adding && <li className="text-meta text-muted">No sources yet.</li>}
      </ul>
    </section>
  );
}

function SourceRow({ eventId, source: s, onChange }: { eventId: string; source: EventSource; onChange: (d: Loaded) => void }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const r = await adminFetch(`/api/admin/events/${eventId}/sources/${s.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error ?? `HTTP ${r.status}`);
    onChange(d);
  }

  if (editing) return <SourceForm eventId={eventId} source={s} onDone={(d) => (d && onChange(d), setEditing(false))} />;
  return (
    <li className="rounded-control border border-line p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                {s.title} ↗
              </a>
            ) : (
              s.title
            )}
          </p>
          <p className="text-meta text-muted">
            {[SOURCE_TYPE_EN[s.source_type], s.author_or_publisher, s.published_on].filter(Boolean).join(" · ")}
          </p>
          {s.notes && <p className="mt-1 text-meta text-ink-2">{s.notes}</p>}
          {s.evidence_quote && <blockquote className="mt-1 border-s-2 border-line-strong ps-2 text-meta text-ink-2">{s.evidence_quote}</blockquote>}
        </div>
        <span className="flex shrink-0 flex-wrap gap-1">
          {s.origin === "ai_suggestion" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-micro text-accent">AI-suggested</span>}
          <span className={`rounded-full px-2 py-0.5 text-micro ${s.verified ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
            {s.verified ? "✓ Verified" : "Not verified"}
          </span>
        </span>
      </div>
      <div className="mt-2 flex gap-3 text-meta">
        <button type="button" onClick={() => setEditing(true)} className="font-semibold text-accent hover:underline">
          Edit
        </button>
        <button type="button" onClick={remove} className="text-danger hover:underline">
          Delete
        </button>
        {error && <span className="text-danger">{error}</span>}
      </div>
    </li>
  );
}

function SourceForm({ eventId, source, onDone }: { eventId: string; source?: EventSource; onDone: (d?: Loaded) => void }) {
  const [f, setF] = useState(() => ({
    title: source?.title ?? "",
    url: source?.url ?? "",
    author_or_publisher: source?.author_or_publisher ?? "",
    published_on: source?.published_on ?? "",
    source_type: source?.source_type ?? "other",
    notes: source?.notes ?? "",
    verified: source?.verified ?? false,
    evidence_quote: source?.evidence_quote ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const path = source ? `/api/admin/events/${eventId}/sources/${source.id}` : `/api/admin/events/${eventId}/sources`;
    const r = await adminFetch(path, { method: source ? "PUT" : "POST", body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.issues?.[0]?.message ?? d.error ?? `HTTP ${r.status}`);
    onDone(d);
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-control border border-accent/40 bg-paper p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={label}>
          Source title
          <input required value={f.title} onChange={(e) => set("title", e.target.value)} className={field} placeholder="Language Movement — Banglapedia" />
        </label>
        <label className={label}>
          Link (optional)
          <input type="url" value={f.url} onChange={(e) => set("url", e.target.value)} className={field} placeholder="https://…" />
        </label>
        <label className={label}>
          Author or publisher
          <input value={f.author_or_publisher} onChange={(e) => set("author_or_publisher", e.target.value)} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Published
            <input value={f.published_on} onChange={(e) => set("published_on", e.target.value)} className={field} placeholder="2003" />
          </label>
          <label className={label}>
            Type
            <select value={f.source_type} onChange={(e) => set("source_type", e.target.value as typeof f.source_type)} className={field}>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SOURCE_TYPE_EN[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <label className={label}>
        Notes
        <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={field} placeholder="What’s in which part, page numbers…" />
      </label>
      <label className={label}>
        Quote (the exact passage that supports the fact)
        <textarea rows={2} value={f.evidence_quote} onChange={(e) => set("evidence_quote", e.target.value)} className={field} />
      </label>
      <label className="flex items-center gap-2 text-meta">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={f.verified} onChange={(e) => set("verified", e.target.checked)} />
        I opened and checked this source myself (verified)
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}>
          {busy ? "…" : source ? "Save" : "Add"}
        </button>
        <button type="button" onClick={() => onDone()} className={`${btn} text-muted hover:text-ink`}>
          Cancel
        </button>
        {error && <span className="text-meta text-danger">{error}</span>}
      </div>
    </form>
  );
}
