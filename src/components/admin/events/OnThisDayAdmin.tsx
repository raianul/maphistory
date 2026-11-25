"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { STATUS_EN, todayInDhaka, type EventStatus } from "@/lib/events/schema";
import type { DayCoverage } from "@/lib/events/db";
import { adminFetch } from "@/lib/supabase-browser";
import { StatusBadge } from "./shared";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COUNTRIES = [{ code: "BD", name: "Bangladesh" }];
/** A year for the admin list: 1971, or 500 BC. */
const yearEn = (y: number) => (y < 0 ? `${-y} BC` : String(y));
const field = "h-10 rounded-control border border-line-strong bg-card px-3 text-meta outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";

type Candidate = {
  year: number;
  title_bn: string;
  summary_bn: string;
  place: string;
  category: string;
  source_url: string;
  source_quote: string;
  check: { confirmed: boolean; reason: string; page_title: string | null };
  subject?: string;
  kind?: "person" | "event";
  subject_qid?: string | null;
  /** A story already shows on this date. */
  existing: { id: string; title: string; status: EventStatus; story_title?: string } | null;
  /** The subject already has a story, without this date: add the date (no AI call). */
  story?: { id: string; title: string; status: EventStatus } | null;
};
type Saved = { id: string; title: string; status: EventStatus; year: number | null };

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/**
 * /admin/events/today: the simple way to make "On this day" content. Pick a date (today by
 * default) and a country, find events (AI + web search, each checked against its source page),
 * choose one, and generate a draft with its timeline. The draft opens in the preview to publish.
 */
export function OnThisDayAdmin() {
  const today = todayInDhaka();
  // The date and country live in the address (?day=&month=&country=), so Back from a draft's
  // preview returns to the same list.
  const [day, setDay] = useState(() => Number(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("day")) || today.day);
  const [month, setMonth] = useState(() => Number(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("month")) || today.month);
  const [country, setCountry] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("country") || "BD");
  const [state, setState] = useState<"idle" | "loading" | "finding" | "found" | "generating">("loading");
  const [result, setResult] = useState<{ candidates: Candidate[]; saved: Saved[]; searched_at: string | null } | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // The calendar's month (starts at the chosen date's) and what each of its days has.
  const [view, setView] = useState(() => ({ year: today.year, month }));
  const [cover, setCover] = useState<{ key: string; days: DayCoverage[] } | null>(null);
  const viewKey = `${view.year}-${view.month}`;
  useEffect(() => {
    let live = true;
    adminFetch(`/api/admin/on-this-day/month?month=${view.month}&year=${view.year}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (live && r.ok) setCover({ key: `${view.year}-${view.month}`, days: d.days });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [view.year, view.month]);
  const coverage = cover?.key === viewKey ? cover.days : null;
  const pickedYear = month === view.month ? view.year : today.year;
  const picked = month === view.month ? coverage?.[day - 1] : undefined;
  const shift = (by: 1 | -1) =>
    setView((v) => {
      const m = v.month + by;
      return m < 1 ? { year: v.year - 1, month: 12 } : m > 12 ? { year: v.year + 1, month: 1 } : { year: v.year, month: m };
    });

  /**
   * Finds events for the chosen date. "find": the saved search, else a new AI search; "fresh":
   * always a new AI search (it replaces the saved one).
   */
  async function load(mode: "find" | "fresh") {
    setState("finding");
    setError(null);
    setChosen(null);
    setResult(null);
    const q = `day=${day}&month=${month}&country=${country}${mode === "fresh" ? "&fresh=1" : ""}`;
    const r = await adminFetch(`/api/admin/on-this-day?${q}`).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) {
      setState("idle");
      return setError(d.error ?? "Couldn't search for events");
    }
    setResult({ candidates: d.candidates, saved: d.saved, searched_at: d.searched_at });
    const first = (d.candidates as Candidate[]).findIndex((c) => !c.existing && !c.story && c.check.confirmed);
    setChosen(first >= 0 ? first : null);
    setState("found");
  }
  const find = (e?: React.FormEvent) => {
    e?.preventDefault();
    return load("find");
  };
  // A saved list for the date shows at once (on opening the page, and whenever the date changes):
  // asked for here, state set only when the answer arrives (no AI search).
  useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.href);
    url.searchParams.set("day", String(day));
    url.searchParams.set("month", String(month));
    url.searchParams.set("country", country);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    adminFetch(`/api/admin/on-this-day?day=${day}&month=${month}&country=${country}&saved=1`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        setChosen(null);
        if (!r.ok) {
          setResult(null);
          setError(d.error ?? "Couldn't load the list");
          return setState("idle");
        }
        setError(null);
        if (!d.searched_at) {
          setResult(d.saved?.length ? { candidates: [], saved: d.saved, searched_at: null } : null);
          return setState("idle");
        }
        setResult({ candidates: d.candidates, saved: d.saved, searched_at: d.searched_at });
        const first = (d.candidates as Candidate[]).findIndex((c) => !c.existing && !c.story && c.check.confirmed);
        setChosen(first >= 0 ? first : null);
        setState("found");
      })
      .catch(() => !cancelled && setState("idle"));
    return () => {
      cancelled = true;
    };
  }, [day, month, country]);

  /** The subject already has a story: add this date to it (a draft) and open it. No AI call. */
  async function addDateTo(c: Candidate) {
    if (!c.story) return;
    setError(null);
    const r = await adminFetch(`/api/admin/events/${c.story.id}/dates`, {
      method: "POST",
      body: JSON.stringify({ year: c.year, month, day, title: c.title_bn, summary: c.summary_bn || null }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) return setError(d.error ?? "Couldn't add the date");
    router.push(`/admin/events/${c.story.id}/preview#dates`);
  }

  async function generate() {
    if (chosen === null || !result) return;
    const c = result.candidates[chosen];
    setState("generating");
    setError(null);
    setStage("Starting…");
    const res = await adminFetch("/api/admin/on-this-day/generate", {
      method: "POST",
      body: JSON.stringify({ day, month, country, candidate: { ...c, existing: undefined, story: undefined } }),
    }).catch(() => null);
    if (!res || !res.ok || !res.body) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setState("found");
      setStage(null);
      return setError(d.error ?? "Couldn't create the draft");
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "stage") setStage(ev.message);
        if (ev.type === "error") {
          setError(ev.message);
          setState("found");
          setStage(null);
        }
        if (ev.type === "done") {
          if (ev.warnings?.length) sessionStorage.setItem(`draft-warnings:${ev.event_id}`, JSON.stringify(ev.warnings));
          router.push(`/admin/events/${ev.event_id}/preview`);
          return;
        }
      }
    }
  }

  const busy = state === "finding" || state === "generating" || state === "loading";
  const weekday = WEEKDAYS[new Date(Date.UTC(pickedYear, month - 1, day)).getUTCDay()];
  const offset = Math.round((Date.UTC(pickedYear, month - 1, day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000);
  const when = offset === 0 ? "today" : offset === 1 ? "tomorrow" : offset === -1 ? "yesterday" : null;

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-7 lg:flex-row lg:items-start">
      <Calendar
        view={view}
        today={today}
        picked={{ day, month }}
        days={coverage}
        onShift={shift}
        onPick={(d) => {
          if (busy) return;
          setMonth(view.month);
          setDay(d);
        }}
      />

      {/* The chosen day: what it has, and finding more */}
      <aside aria-label={`${day} ${MONTHS[month - 1]}`} className="flex flex-col gap-4 rounded-[20px] border border-line bg-card p-5 lg:sticky lg:top-6 lg:w-[460px] lg:shrink-0">
        <div>
          <p className="text-meta text-muted">
            {weekday}
            {when ? ` · ${when}` : ""}
          </p>
          <h2 className="text-display font-bold tracking-tight">
            {day} {MONTHS[month - 1]}
          </h2>
        </div>
        {picked &&
          (picked.live > 0 ? (
            <p className="rounded-2xl bg-success-soft px-4 py-3 text-meta text-success">
              <span className="font-semibold">
                ✓ {picked.live} {picked.live === 1 ? "story" : "stories"} live
              </span>
              {picked.drafts > 0 ? ` · ${picked.drafts} more in draft` : ""}. You can still add more.
            </p>
          ) : (
            <p className="rounded-2xl bg-warning-soft px-4 py-3 text-meta text-warning">
              <span className="font-semibold">Nothing live for this day.</span> Visitors would see the next date instead
              {picked.drafts > 0 ? `; ${picked.drafts} waiting in draft` : ""}.
            </p>
          ))}
        <form onSubmit={find} className="flex gap-2">
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={`${field} rounded-full`} disabled={busy} aria-label="Country">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} className="h-10 flex-1 rounded-full bg-accent px-5 text-meta font-bold text-on-accent hover:bg-accent-hover disabled:opacity-50">
            {state === "finding" ? "Searching…" : state === "loading" ? "…" : "Find events with AI"}
          </button>
        </form>
      {state === "finding" && (
        <p className="flex items-center gap-2 text-meta text-accent" role="status">
          <span className="size-3.5 animate-spin rounded-full border-2 border-accent-soft-hover border-t-accent" aria-hidden />
          AI is searching the web, then each source page is opened to check the date… (30–60 seconds)
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          {error}
        </p>
      )}

      {result && (
        <section className="flex flex-col" aria-label="Events found">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-semibold">
              {day} {MONTHS[month - 1]}:{" "}
              {!result.searched_at
                ? "not searched yet"
                : result.candidates.length
                  ? `${result.candidates.length} ${result.candidates.length === 1 ? "event" : "events"} found`
                  : "no reliable events found"}
            </h2>
            {result.searched_at && (
              <span className="text-micro text-muted">
                Searched {new Date(result.searched_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                {" · "}
                <button type="button" disabled={busy} onClick={() => load("fresh")} className="font-semibold text-accent hover:underline disabled:opacity-50">
                  Search again
                </button>
              </span>
            )}
          </div>
          {result.searched_at && !result.candidates.length && <p className="mt-1 text-meta text-muted">Try another date, or search again later.</p>}
          {!result.searched_at && <p className="mt-1 text-meta text-muted">Press &ldquo;Find events with AI&rdquo; and it will search; the results are saved for this date.</p>}
          <ul className="mt-3 grid gap-2">
            {result.candidates.map((c, i) => (
              <li key={`${c.year}-${c.title_bn}`}>
                <label
                  className={`flex cursor-pointer gap-3 rounded-control border p-3 transition-colors ${chosen === i ? "border-accent bg-accent-soft/40" : "border-line hover:bg-hover"} ${c.existing ? "cursor-default opacity-80" : ""}`}
                >
                  <input type="radio" name="event" className="mt-1 accent-[var(--accent)]" checked={chosen === i} disabled={!!c.existing || !!c.story || busy} onChange={() => setChosen(i)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold tabular-nums text-ink-2">{yearEn(c.year)}</span>
                      <span className="font-semibold">{c.title_bn}</span>
                    </span>
                    {c.summary_bn && <span className="mt-0.5 block text-meta text-ink-2">{c.summary_bn}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro">
                      {c.check.confirmed ? (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success" title={c.check.reason}>
                          ✓ Date matches the source
                        </span>
                      ) : (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning" title={c.check.reason}>
                          ⚠ Couldn&rsquo;t confirm
                        </span>
                      )}
                      <a href={c.source_url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                        {host(c.source_url)} ↗
                      </a>
                      {c.place && <span className="text-muted">{c.place}</span>}
                    </span>
                    {!c.check.confirmed && <span className="mt-1 block text-micro text-warning">{c.check.reason}. Open the link and check it yourself.</span>}
                    {c.existing && (
                      <span className="mt-1 flex items-center gap-2 text-micro">
                        <StatusBadge status={c.existing.status} />
                        <Link href={`/admin/events/${c.existing.id}/preview`} className="font-semibold text-accent hover:underline">
                          Already on this date{c.existing.story_title && c.existing.story_title !== c.existing.title ? ` (story: ${c.existing.story_title})` : ""}: open →
                        </Link>
                      </span>
                    )}
                    {c.story && (
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-micro">
                        <StatusBadge status={c.story.status} />
                        <span className="text-ink-2">
                          {c.kind === "person" ? "This person" : "This subject"} already has a story: <span className="font-semibold">{c.story.title}</span>
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(ev) => {
                            ev.preventDefault();
                            addDateTo(c);
                          }}
                          className="rounded-full bg-accent px-3 py-1 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
                        >
                          Add this date to it (no AI)
                        </button>
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {result.saved.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-micro font-semibold text-muted">Events already saved for this date</p>
              <ul className="mt-1 grid gap-1">
                {result.saved.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-meta">
                    <StatusBadge status={s.status} />
                    <Link href={`/admin/events/${s.id}/preview`} className="hover:text-accent hover:underline">
                      {s.year ? `${yearEn(s.year)} — ` : ""}
                      {s.title}
                    </Link>
                    <span className="text-micro text-muted">{STATUS_EN[s.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.candidates.some((c) => !c.existing && !c.story) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={chosen === null || busy}
                onClick={generate}
                className="h-11 rounded-full bg-accent px-6 text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {state === "generating" ? "Creating…" : "Create draft"}
              </button>
              {stage && (
                <span className="flex items-center gap-2 text-meta text-accent" role="status" aria-live="polite">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-accent-soft-hover border-t-accent" aria-hidden />
                  {stage}
                </span>
              )}
              {!stage && chosen !== null && !result.candidates[chosen].check.confirmed && <span className="text-micro text-warning">This event&rsquo;s date isn&rsquo;t confirmed; check the source before publishing.</span>}
            </div>
          )}
        </section>
      )}
      </aside>
    </main>
  );
}

/** The month: each day live (green), with drafts (amber), or empty (dashed); past days step back. */
function Calendar({
  view,
  today,
  picked,
  days,
  onShift,
  onPick,
}: {
  view: { year: number; month: number };
  today: { year: number; month: number; day: number };
  picked: { day: number; month: number };
  days: DayCoverage[] | null;
  onShift: (by: 1 | -1) => void;
  onPick: (day: number) => void;
}) {
  const count = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const lead = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay();
  const t = Date.UTC(today.year, today.month - 1, today.day);
  const arrow = "grid size-10 place-items-center rounded-full border border-line-strong bg-card text-ink transition-colors hover:bg-hover";
  return (
    <section aria-label="Calendar" className="flex min-w-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-display font-bold tracking-tight">On this day</h1>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onShift(-1)} aria-label="Previous month" className={arrow}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <span className="min-w-40 text-center text-lead font-bold" aria-live="polite">
            {MONTHS[view.month - 1]} {view.year !== today.year ? view.year : ""}
          </span>
          <button type="button" onClick={() => onShift(1)} aria-label="Next month" className={arrow}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </header>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-success" aria-hidden /> Live stories
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#c9a25f]" aria-hidden /> Draft to review
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border-[1.5px] border-dashed border-[#c9a25f]" aria-hidden /> Empty: visitors see the next date
        </span>
      </p>
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <span key={w} className="px-1 text-micro font-semibold tracking-wide text-muted uppercase">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const d = i + 1;
          const c = days?.[i];
          const at = Date.UTC(view.year, view.month - 1, d);
          const past = at < t;
          const isToday = at === t;
          const on = picked.day === d && picked.month === view.month;
          const empty = c ? c.live === 0 : false;
          const label = !c ? "" : c.live > 0 ? `● ${c.live} live` : c.drafts > 0 ? `${c.drafts} draft` : past ? "—" : "Empty";
          const tone = !c ? "" : c.live > 0 ? "text-success" : past ? "text-muted" : "text-warning";
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              aria-pressed={on}
              aria-label={`${d} ${MONTHS[view.month - 1]}${c ? `: ${c.live} live, ${c.drafts} draft` : ""}`}
              className={`flex h-14 flex-col items-start justify-between rounded-xl p-1.5 text-start transition-colors md:h-[104px] md:rounded-2xl md:p-3 ${
                on
                  ? "border-2 border-accent bg-accent-soft"
                  : empty && !past
                    ? "border-[1.5px] border-dashed border-[#d9b77a] bg-[#fdf9f1] hover:bg-warning-soft"
                    : "border border-line bg-card hover:border-line-strong"
              } ${past && !on ? "opacity-55" : ""}`}
            >
              <span className={`grid min-w-6 place-items-center font-bold ${isToday ? "h-6 rounded-full bg-accent px-1 text-on-accent" : ""}`}>{d}</span>
              <span className={`hidden text-micro font-semibold md:block ${tone}`}>{label}</span>
              {/* Phones: a dot says it all */}
              {c && (c.live > 0 || c.drafts > 0) && <span className={`size-1.5 rounded-full md:hidden ${c.live > 0 ? "bg-success" : "bg-[#c9a25f]"}`} aria-hidden />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
