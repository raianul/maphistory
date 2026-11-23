"use client";

import { useState } from "react";
import type { EventDate, EventSource, HistoricalEvent, TimelineStep } from "@/lib/events/schema";
import { adminFetch } from "@/lib/supabase-browser";

type Loaded = { event: HistoricalEvent; sources: EventSource[]; steps: TimelineStep[]; dates?: EventDate[]; problems: string[] };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const field =
  "w-full rounded-control border border-line-strong bg-card px-3 py-2 text-meta outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-ring";
const btn = "h-8 rounded-full px-3 text-micro font-semibold transition-colors disabled:opacity-50";
const dateText = (d: { year: number; month: number; day: number }) => `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
const sameDay = (a: { year: number; month: number; day: number }, b: { year: number | null | undefined; month: number | null | undefined; day: number | null | undefined }) =>
  a.year === b.year && a.month === b.month && a.day === b.day;

type Form = { day: string; month: string; year: string; title: string; summary: string; step_id: string };
const empty: Form = { day: "", month: "", year: "", title: "", summary: "", step_id: "" };

/**
 * The days a story appears on "On this day", each with its own headline (Colonel Taher: "arrested"
 * on 24 Nov, "hanged" on 21 Jul) and the step it opens at. Dates are drafts until approved, or
 * until the story is published. Steps with a full date not used yet are offered as suggestions.
 */
export function DatesPanel({ data, onChange }: { data: Loaded; onChange: (d: Loaded) => void }) {
  const { event, steps } = data;
  const dates = data.dates ?? [];
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(key: string, path: string, method: string, body?: object) {
    setBusy(key);
    setError(null);
    const r = await adminFetch(`/api/admin/events/${event.id}/dates${path}`, { method, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setError(d.error ?? `HTTP ${r.status}`);
      return false;
    }
    onChange(d);
    return true;
  }

  const stepLabel = (id: string | null) => {
    const i = id ? steps.findIndex((s) => s.id === id) : -1;
    return i >= 0 ? `opens at step ${i + 1}: ${steps[i].title}` : "opens at step 1";
  };
  const open = (d?: EventDate) => {
    setError(null);
    setEditing(d?.id ?? "new");
    setForm(d ? { day: String(d.day), month: String(d.month), year: String(d.year), title: d.title, summary: d.summary ?? "", step_id: d.step_id ?? "" } : empty);
  };
  const payload = () => ({
    day: Number(form.day),
    month: Number(form.month),
    year: Number(form.year),
    title: form.title,
    summary: form.summary,
    step_id: form.step_id || null,
  });

  // Steps with a full date that aren't an "On this day" date yet.
  const suggestions = steps.filter(
    (s) => s.step_year && s.step_year > 0 && s.step_month && s.step_day && !dates.some((d) => sameDay(d, { year: s.step_year, month: s.step_month, day: s.step_day })),
  );

  return (
    <section id="dates" className="mt-5 scroll-mt-20 rounded-2xl bg-card p-4 shadow-float md:p-5" aria-label="On this day dates">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">On this day dates</h2>
          <p className="mt-1 text-meta text-muted">
            The days this story appears on &ldquo;On this day&rdquo;, each with its own headline. New dates are drafts: they go live when you approve them, or when the story is
            published.{event.status !== "published" && " This story isn’t published yet, so none of its dates show to visitors."}
          </p>
        </div>
        {editing !== "new" && (
          <button type="button" onClick={() => open()} className={`${btn} bg-accent-soft text-accent hover:bg-accent-soft-hover`}>
            + Add a date
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          {error}
        </p>
      )}

      <ul className="mt-3 grid gap-2">
        {dates.map((d) =>
          editing === d.id ? (
            <li key={d.id}>
              <DateForm form={form} setForm={setForm} steps={steps} busy={busy === d.id} onCancel={() => setEditing(null)} onSave={async () => (await call(d.id, `/${d.id}`, "PATCH", payload())) && setEditing(null)} />
            </li>
          ) : (
            <li key={d.id} className="flex flex-wrap items-start gap-2 rounded-control border border-line px-3 py-2">
              <span className="w-36 shrink-0 text-meta font-semibold text-ink-2 tabular-nums">{dateText(d)}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{d.title}</span>
                {d.summary && <span className="block text-meta text-ink-2">{d.summary}</span>}
                <span className="block text-micro text-muted">{stepLabel(d.step_id)}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-micro font-semibold ${d.status === "published" ? "bg-success-soft text-success" : "bg-pressed/60 text-ink-2"}`}>
                {d.status === "published" ? "Live" : "Draft"}
              </span>
              <span className="flex gap-1">
                {d.status === "draft" ? (
                  <button type="button" disabled={!!busy} onClick={() => call(d.id, `/${d.id}`, "PATCH", { status: "published" })} className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}>
                    {busy === d.id ? "…" : "Approve"}
                  </button>
                ) : (
                  <button type="button" disabled={!!busy} onClick={() => call(d.id, `/${d.id}`, "PATCH", { status: "draft" })} className={`${btn} bg-hover text-ink-2 hover:bg-pressed`}>
                    Withdraw
                  </button>
                )}
                <button type="button" disabled={!!busy} onClick={() => open(d)} className={`${btn} text-muted hover:text-ink`}>
                  Edit
                </button>
                <button type="button" disabled={!!busy} onClick={() => call(d.id, `/${d.id}`, "DELETE")} className={`${btn} text-danger hover:bg-hover`}>
                  Delete
                </button>
              </span>
            </li>
          ),
        )}
        {!dates.length && editing !== "new" && <li className="text-meta text-muted">No dates yet: this story doesn&rsquo;t appear on &ldquo;On this day&rdquo;.</li>}
      </ul>

      {editing === "new" && (
        <div className="mt-2">
          <DateForm form={form} setForm={setForm} steps={steps} busy={busy === "new"} onCancel={() => setEditing(null)} onSave={async () => (await call("new", "", "POST", payload())) && setEditing(null)} />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-micro font-semibold text-muted">Steps with a full date, not on &ldquo;On this day&rdquo; yet</p>
          <ul className="mt-1 grid gap-1">
            {suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-meta">
                <span className="w-36 shrink-0 tabular-nums text-ink-2">{dateText({ year: s.step_year!, month: s.step_month!, day: s.step_day! })}</span>
                <span className="min-w-0 flex-1">{s.title}</span>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => call(`s-${s.id}`, "", "POST", { year: s.step_year, month: s.step_month, day: s.step_day, title: s.title, step_id: s.id })}
                  className={`${btn} bg-accent-soft text-accent hover:bg-accent-soft-hover`}
                >
                  {busy === `s-${s.id}` ? "…" : "+ Add as a date"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DateForm({ form, setForm, steps, busy, onSave, onCancel }: { form: Form; setForm: (f: Form) => void; steps: TimelineStep[]; busy: boolean; onSave: () => void; onCancel: () => void }) {
  const set = (k: keyof Form, v: string) => setForm({ ...form, [k]: v });
  // Picking a step with a full date fills the date (and the headline, when empty).
  const pickStep = (id: string) => {
    const s = steps.find((x) => x.id === id);
    const full = s && s.step_year && s.step_month && s.step_day;
    setForm({
      ...form,
      step_id: id,
      ...(full ? { day: String(s.step_day), month: String(s.step_month), year: String(s.step_year) } : {}),
      ...(s && !form.title.trim() ? { title: s.title } : {}),
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="grid gap-2 rounded-control border border-accent/40 bg-paper p-3"
    >
      <div className="grid gap-2 md:grid-cols-[5rem_1fr_6rem]">
        <input required type="number" min={1} max={31} value={form.day} onChange={(e) => set("day", e.target.value)} className={field} placeholder="Day" aria-label="Day" />
        <select required value={form.month} onChange={(e) => set("month", e.target.value)} className={field} aria-label="Month">
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input required type="number" min={1} max={2100} value={form.year} onChange={(e) => set("year", e.target.value)} className={field} placeholder="Year" aria-label="Year" />
      </div>
      <label className="grid gap-1 text-micro font-semibold text-ink-2">
        Headline for this date (what visitors see in the list)
        <input required value={form.title} onChange={(e) => set("title", e.target.value)} className={field} placeholder="e.g. কর্নেল তাহেরের ফাঁসি" />
      </label>
      <label className="grid gap-1 text-micro font-semibold text-ink-2">
        One line for the list (optional; else the story&rsquo;s summary)
        <input value={form.summary} onChange={(e) => set("summary", e.target.value)} className={field} />
      </label>
      <label className="grid gap-1 text-micro font-semibold text-ink-2">
        Opens at
        <select value={form.step_id} onChange={(e) => pickStep(e.target.value)} className={field}>
          <option value="">Step 1 (the beginning)</option>
          {steps.map((s, i) => (
            <option key={s.id} value={s.id}>
              Step {i + 1}: {s.title}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={`${btn} h-9 bg-accent text-on-accent hover:bg-accent-hover`}>
          {busy ? "Saving…" : "Save date"}
        </button>
        <button type="button" onClick={onCancel} className={`${btn} h-9 text-muted hover:text-ink`}>
          Cancel
        </button>
      </div>
    </form>
  );
}
