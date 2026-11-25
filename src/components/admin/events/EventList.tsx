"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { columnOf, nextShown, type Column } from "@/lib/events/board";
import { STATUS_EN, todayInDhaka, type EventListRow } from "@/lib/events/schema";
import { adminFetch } from "@/lib/supabase-browser";
import { dateBn } from "./shared";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const field = "h-[42px] rounded-full border border-line-strong bg-card px-3.5 text-meta outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";
/** Live events shown before "Show all". */
const LIVE_FIRST = 8;

const COLUMNS: { id: Column; title: string; note: string; dot: string; ground: string; head: string; card: string }[] = [
  { id: "drafts", title: "Drafts", note: "Being written or researched", dot: "bg-subtle", ground: "bg-hover", head: "text-ink", card: "border-line" },
  { id: "review", title: "Ready for you", note: "Read, then publish", dot: "bg-[#c9a25f]", ground: "bg-warning-soft", head: "text-warning", card: "border-[#efdcb8]" },
  { id: "live", title: "Live", note: "Visitors see these", dot: "bg-success", ground: "bg-success-soft", head: "text-success", card: "border-[#d5e6da]" },
];

/** A value from the page's address (the admin renders in the browser only, after login). */
const param = (key: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(key));

/**
 * /admin/events: every historical event on a board, in the order an event lives:
 * Drafts → Ready for you (Preview, Publish) → Live. Archived ones sit behind a switch.
 * Phones show one column at a time. Home links here with ?status=review.
 */
export function EventList() {
  const [rows, setRows] = useState<EventListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [country, setCountry] = useState("");
  const [archived, setArchived] = useState(false);
  const [allLive, setAllLive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);
  // Phones: one column at a time (Home's "Review" opens the middle one).
  const [phoneCol, setPhoneCol] = useState<Column>(() => (param("status") === "review" ? "review" : param("status") === "published" ? "live" : "review"));

  useEffect(() => {
    const params = new URLSearchParams({ board: "1" });
    if (q.trim()) params.set("q", q.trim());
    if (month) params.set("month", month);
    if (country.trim()) params.set("country", country.trim());
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      adminFetch(`/api/admin/events?${params}`, { signal: ctrl.signal })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (r.ok) {
            setRows(data.events);
            setError(null);
          } else setError(data.error ?? `HTTP ${r.status}`);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, month, country, version]);

  const today = todayInDhaka();
  const by = (c: Column) => (rows ?? []).filter((r) => columnOf(r.status) === c);
  // Live: what visitors see soonest first; the rest by their date.
  const live = by("live").sort((a, b) => (nextShown(a.shown_on, today)?.inDays ?? 999) - (nextShown(b.shown_on, today)?.inDays ?? 999));
  const lists: Record<Column, EventListRow[]> = { drafts: by("drafts"), review: by("review"), live };
  const old = (rows ?? []).filter((r) => r.status === "archived");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-10 md:py-7">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="text-display font-bold tracking-tight">Historical events</h1>
          <p className="text-meta text-muted">AI writes a draft, you read it, Publish puts it live. Visitors only see Live.</p>
        </div>
        <Link href="/admin/events/today" className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 font-bold text-on-accent transition-colors hover:bg-accent-hover">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Find events for a day
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className={`${field} flex min-w-56 flex-1 items-center gap-2`}>
          <svg viewBox="0 0 24 24" className="size-[17px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search title, place or slug…" aria-label="Search events" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={field} aria-label="Month">
          <option value="">Any month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country (BD)" maxLength={2} className={`${field} w-32 uppercase placeholder:normal-case`} aria-label="Country code" />
        <button type="button" onClick={() => setCreating((c) => !c)} className="h-[42px] rounded-full px-3 text-meta font-semibold text-ink-2 hover:bg-hover hover:text-ink">
          + Write one yourself
        </button>
      </div>

      {creating && <NewEvent onCancel={() => setCreating(false)} />}
      {error && <p className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{error}</p>}

      {/* Phones: one column at a time */}
      <div role="tablist" aria-label="Column" className="flex gap-1 rounded-full bg-pressed p-1 md:hidden">
        {COLUMNS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={phoneCol === c.id}
            onClick={() => setPhoneCol(c.id)}
            className={`h-9 flex-1 rounded-full text-meta transition-colors ${phoneCol === c.id ? "bg-card font-semibold text-ink shadow-sm" : "text-ink-2"}`}
          >
            {c.id === "review" ? "Ready" : c.title} · {rows ? lists[c.id].length : "…"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 md:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = c.id === "live" && !allLive ? lists.live.slice(0, LIVE_FIRST) : lists[c.id];
          return (
            <section key={c.id} aria-labelledby={`col-${c.id}`} className={`${phoneCol === c.id ? "flex" : "hidden md:flex"} flex-col gap-2.5 rounded-[20px] p-3.5 ${c.ground}`}>
              <h2 id={`col-${c.id}`} className={`flex items-center gap-2 px-1 pt-0.5 font-bold ${c.head}`}>
                <span className={`size-2 rounded-full ${c.dot}`} aria-hidden />
                {c.title}
                <span className="ms-auto font-semibold">{rows ? lists[c.id].length : "…"}</span>
              </h2>
              <p className="-mt-1.5 px-1 text-micro text-muted">{c.note}</p>
              {rows === null && !error && <p className="px-1 py-3 text-meta text-muted">Loading…</p>}
              {rows && list.length === 0 && <p className="px-1 py-3 text-meta text-muted">{c.id === "review" ? "Nothing waiting for you." : "None."}</p>}
              {list.map((r) =>
                c.id === "review" ? (
                  <ReviewCard key={r.id} r={r} cls={c.card} onPublished={() => setVersion((v) => v + 1)} />
                ) : c.id === "live" ? (
                  <LiveCard key={r.id} r={r} cls={c.card} today={today} />
                ) : (
                  <DraftCard key={r.id} r={r} cls={c.card} />
                ),
              )}
              {c.id === "live" && lists.live.length > LIVE_FIRST && (
                <button type="button" onClick={() => setAllLive((a) => !a)} className="self-start px-1 py-1 text-meta font-semibold text-accent hover:text-accent-hover">
                  {allLive ? "Show fewer" : `Show all ${lists.live.length} →`}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {old.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => setArchived((a) => !a)} aria-expanded={archived} className="self-start text-meta font-semibold text-ink-2 hover:text-ink">
            {archived ? "▾" : "▸"} Archived · {old.length}
          </button>
          {archived && (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
              {old.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/events/${r.id}/preview`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-hover">
                    <span className="w-36 shrink-0 text-meta text-ink-2 tabular-nums">{dateBn(r)}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
const placeOf = (r: EventListRow) => [r.place_name, r.city].filter(Boolean).join(", ") || "No place yet";

function DraftCard({ r, cls }: { r: EventListRow; cls: string }) {
  return (
    <Link href={`/admin/events/${r.id}`} className={`flex flex-col gap-1 rounded-2xl border bg-card p-3.5 transition-colors hover:border-line-strong ${cls}`}>
      <span className="text-micro text-muted">{dateBn(r)}</span>
      <span className="leading-snug font-bold">{r.title}</span>
      <span className="text-micro text-muted">
        {STATUS_EN[r.status]} · {placeOf(r)} · {count(r.source_count, "source")}
      </span>
    </Link>
  );
}

/** Waiting for the editor: what it has, what still blocks it, and the two things to do. */
function ReviewCard({ r, cls, onPublished }: { r: EventListRow; cls: string; onPublished: () => void }) {
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>(r.problems ?? []);
  const [err, setErr] = useState<string | null>(null);
  const ready = problems.length === 0;

  async function publish() {
    setBusy(true);
    setErr(null);
    const res = await adminFetch(`/api/admin/events/${r.id}/status`, { method: "POST", body: JSON.stringify({ to: "published" }) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; problems?: string[] };
    setBusy(false);
    if (res.ok) return onPublished();
    if (d.problems?.length) setProblems(d.problems);
    else setErr(d.error ?? `HTTP ${res.status}`);
  }

  return (
    <article className={`flex flex-col gap-1.5 rounded-2xl border bg-card p-3.5 ${cls}`}>
      <span className="text-micro text-muted">{dateBn(r)}</span>
      <span className="leading-snug font-bold">{r.title}</span>
      <span className="text-micro text-muted">
        {placeOf(r)} · {count(r.source_count, "source")} · {count(r.step_count, "map step")}
      </span>
      {ready ? (
        <span className="text-meta font-semibold text-success">✓ Ready to publish</span>
      ) : (
        <span className="text-meta font-semibold text-warning" title={problems.join("\n")}>
          {problems.length === 1 ? problems[0] : `${problems.length} things to fix first`}
        </span>
      )}
      {err && <span className="text-meta text-danger">{err}</span>}
      <span className="mt-1 flex gap-2">
        <Link href={`/admin/events/${r.id}/preview`} className="grid h-[38px] flex-1 place-items-center rounded-full border border-line-strong text-meta font-semibold text-ink hover:bg-hover">
          {ready ? "Preview" : "Preview & fix"}
        </Link>
        {ready && (
          <button type="button" disabled={busy} onClick={publish} className="h-[38px] flex-1 rounded-full bg-success text-meta font-bold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : "Publish"}
          </button>
        )}
      </span>
    </article>
  );
}

function LiveCard({ r, cls, today }: { r: EventListRow; cls: string; today: { year: number; month: number; day: number } }) {
  const next = nextShown(r.shown_on, today);
  const when = !next ? "No approved date yet" : next.inDays === 0 ? "Showing today" : next.inDays === 1 ? "Shown tomorrow" : `Shown next: ${next.day} ${SHORT[next.month - 1]} · in ${next.inDays} days`;
  return (
    <Link href={`/admin/events/${r.id}/preview`} className={`flex flex-col gap-1 rounded-2xl border bg-card px-3.5 py-3 transition-colors hover:border-line-strong ${cls}`}>
      <span className="text-micro text-muted">{dateBn(r)}</span>
      <span className="leading-snug font-bold">{r.title}</span>
      <span className={`text-micro font-semibold ${next ? "text-success" : "text-muted"}`}>{when}</span>
    </Link>
  );
}

/** A short form: title and slug, then straight into the full editor. Starts as a draft. */
function NewEvent({ onCancel }: { onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // The full date and place are filled in the editor; "approximate" with a placeholder label
    // lets a draft exist before its date is known.
    const r = await adminFetch("/api/admin/events", {
      method: "POST",
      body: JSON.stringify({ title, slug, date_precision: "approximate", date_label: "তারিখ ঠিক করা হয়নি" }),
    });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(data.issues?.[0]?.message ?? data.error ?? `HTTP ${r.status}`);
    router.push(`/admin/events/${data.event.id}`);
  }

  return (
    <form onSubmit={create} className="grid gap-3 rounded-2xl border border-line bg-card p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="grid gap-1 text-meta">
        Title
        <input required value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. ভাষা আন্দোলন" autoFocus />
      </label>
      <label className="grid gap-1 text-meta">
        Slug (for the link, in English)
        <input
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
          className={field}
          placeholder="language-movement-1952"
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-10 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {busy ? "Creating…" : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-full px-3 text-meta text-muted hover:text-ink">
          Cancel
        </button>
      </div>
      {error && <p className="text-meta text-danger md:col-span-3">{error}</p>}
    </form>
  );
}
