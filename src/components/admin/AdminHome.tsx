"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HomeDay, HomePlace } from "@/lib/admin-home";
import { ago } from "@/lib/format";
import { adminFetch, browserSupabase } from "@/lib/supabase-browser";
import { Mark, useAdminHome } from "./AdminShell";

const DHAKA = "Asia/Dhaka";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The admin's start page: what needs the editor today, with the way to each. */
export function AdminHome({ email }: { email?: string }) {
  const { data, error, reload } = useAdminHome();
  const router = useRouter();
  const [q, setQ] = useState("");
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: DHAKA });

  const c = data?.counts;
  const title = !c ? "Home" : c.total === 0 ? "All clear today" : `${plural(c.total, "thing")} ${c.total === 1 ? "needs" : "need"} you today`;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-6 md:px-10 md:py-7">
      {/* Phones: the menu's account line lives here. */}
      <div className="flex items-center gap-2.5 md:hidden">
        <Mark className="size-8 rounded-[10px]" />
        <span className="flex-1 font-bold">Ondor admin</span>
        <a href="/" target="_blank" rel="noreferrer" className="text-meta font-semibold text-accent">
          Site ↗
        </a>
        <button type="button" onClick={() => browserSupabase().auth.signOut()} className="text-meta text-muted underline" title={email}>
          Log out
        </button>
      </div>

      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-meta text-muted">{today}</p>
          <h1 className="text-display font-bold tracking-tight">{title}</h1>
        </div>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/admin/places?q=${encodeURIComponent(q.trim())}`);
          }}
          className="flex h-11 w-full items-center gap-2 rounded-full border border-line-strong bg-card px-3.5 focus-within:border-accent md:w-80"
        >
          <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Find a place…" aria-label="Find a place" className="min-w-0 flex-1 bg-transparent outline-none" />
        </form>
      </header>

      {error && <p className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{error}</p>}

      <Section title="Needs you">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <NeedCard href="/admin/places?filter=reported" tone="text-danger" icon="M5 21V4M5 4h11l-2 4 2 4H5" label="Mistakes reported" n={c?.reports} note="Visitors flagged a story" go="Read them" />
          <NeedCard href="/admin/events?status=review" tone="text-warning" icon="M4 20h4L19 9l-4-4L4 16z" label="Drafts to review" n={c?.review} note="AI wrote them; publish or fix" go="Review" />
          <NeedCard
            href="/admin/places?filter=ai&sort=views"
            tone="text-accent"
            icon="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
            label="Popular, not checked"
            n={c?.popular}
            note={data?.weekly ? "Opened often this week, still AI only" : "Opened often, still AI only"}
            go="Check them"
          />
          <NeedCard href="/admin/events/today" tone="text-success" icon="M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4" label="Empty days ahead" n={c?.emptyDays} note="of the next 7 have no story" go="Fill them" />
        </div>
      </Section>

      <Section title="On this day · next 7 days" more={{ href: "/admin/events/today", label: "Open On this day" }}>
        <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0">
          {(data?.days ?? Array.from({ length: 7 }, () => null)).map((d, i) => (
            <DayTile key={i} d={d} today={i === 0} />
          ))}
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="New stories by AI" note={data?.weekly ? "written this week, still unchecked" : "written this week"}>
          {data && data.fresh.length === 0 && <Empty>Nothing new this week.</Empty>}
          {data?.fresh.map((p) => <FreshRow key={p.id} p={p} weekly={data.weekly} onChanged={reload} />)}
        </Panel>

        <Panel title="What visitors said" note="reports and dislikes">
          {data && data.reports.length === 0 && data.disliked.length === 0 && <Empty>No reports, and no place is disliked.</Empty>}
          {data?.reports.map((r, i) => (
            <Said
              key={`r${i}`}
              kind="report"
              name={r.name_bn}
              text={r.message ? `“${r.message}”` : "(no message)"}
              when={ago(r.created_at)}
              href={`/admin/places?id=${r.story_id}`}
              go="Fix"
            />
          ))}
          {data?.disliked.map((d) => (
            <Said key={d.id} kind="dislike" name={d.name_bn} text={`More dislikes than likes: ${d.likes} to ${d.dislikes}`} href={`/admin/places?id=${d.id}`} go="Look" />
          ))}
        </Panel>
      </div>
    </main>
  );
}

function Section({ title, more, children }: { title: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-micro font-semibold tracking-[0.06em] text-muted uppercase">{title}</h2>
        {more && (
          <Link href={more.href} className="ms-auto text-meta font-semibold text-accent hover:text-accent-hover">
            {more.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function NeedCard({ href, tone, icon, label, n, note, go }: { href: string; tone: string; icon: string; label: string; n?: number; note: string; go: string }) {
  const zero = n === 0;
  return (
    <Link href={href} className="flex flex-col gap-2 rounded-[18px] border border-line bg-card p-4 transition-colors hover:border-line-strong md:p-[18px]">
      <span className={`flex items-center gap-2 text-meta font-semibold ${zero ? "text-muted" : tone}`}>
        <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={icon} />
        </svg>
        {label}
      </span>
      <span className={`text-[2rem] leading-none font-bold tabular-nums ${zero ? "text-muted" : ""}`}>{n ?? "…"}</span>
      <span className="text-meta text-muted">{note}</span>
      {!zero && <span className="mt-auto pt-1 text-meta font-semibold text-accent">{go} →</span>}
    </Link>
  );
}

function DayTile({ d, today }: { d: HomeDay | null; today: boolean }) {
  const base = "flex min-h-[112px] w-[132px] shrink-0 flex-col gap-1 rounded-2xl p-3.5 transition-colors md:w-auto";
  if (!d) return <span className={`${base} border border-line bg-card`} />;
  const dow = today ? "Today" : DOW[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
  const empty = d.live === 0;
  return (
    <Link
      href={`/admin/events/today?day=${d.day}&month=${d.month}`}
      className={`${base} ${today ? "border-2 border-accent bg-accent-soft" : empty ? "border-[1.5px] border-dashed border-[#c9a25f] bg-warning-soft hover:bg-warning-soft-hover" : "border border-line bg-card hover:border-line-strong"}`}
    >
      <span className="text-micro font-semibold text-muted">{dow}</span>
      <span className="text-[1.25rem] leading-tight font-bold">
        {d.day} {MONTHS[d.month - 1]}
      </span>
      <span className={`mt-auto text-meta font-semibold ${empty ? "text-warning" : "text-success"}`}>{empty ? "Empty · find events" : `✓ ${plural(d.live, "story", "stories")} live`}</span>
    </Link>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-[18px] border border-line bg-card p-5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-lead font-bold">{title}</h2>
        <span className="text-meta text-muted">{note}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-line py-4 text-meta text-muted">{children}</p>;
}

/** A new AI story: pin it on the map or verify it from here. */
function FreshRow({ p, weekly, onChanged }: { p: HomePlace; weekly: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function act(action: string) {
    setBusy(action);
    setErr(null);
    const r = await adminFetch(`/api/admin/stories/${p.id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    setBusy(null);
    if (!r.ok) return setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
    onChanged();
  }
  const opens = weekly ? p.week ?? 0 : p.views;
  const meta = [p.category, `opened ${plural(opens, "time")}${weekly ? " this week" : ""}`, p.likes ? plural(p.likes, "like") : null].filter(Boolean).join(" · ");
  const btn = "h-9 shrink-0 rounded-full px-3.5 text-meta font-semibold transition-colors disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2.5">
      <Link href={`/admin/places?id=${p.id}`} className="min-w-0 flex-1 basis-52">
        <span className="block truncate font-semibold hover:text-accent">{p.name_bn}</span>
        <span className="block truncate text-meta text-muted">{meta}</span>
        {err && <span className="block text-meta text-danger">{err}</span>}
      </Link>
      {/* The two buttons stay together (on phones under the name). */}
      <span className="flex gap-2">
        <button
          type="button"
          disabled={!!busy}
          aria-pressed={p.show_on_map}
          onClick={() => act(p.show_on_map ? "hide_from_map" : "show_on_map")}
          className={`${btn} border ${p.show_on_map ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-card text-ink-2 hover:bg-hover"}`}
        >
          {busy === "show_on_map" || busy === "hide_from_map" ? "…" : p.show_on_map ? "✓ On map" : "Pin on map"}
        </button>
        <button type="button" disabled={!!busy} onClick={() => act("verify")} className={`${btn} bg-success text-white hover:opacity-90`}>
          {busy === "verify" ? "…" : "Verify"}
        </button>
      </span>
    </div>
  );
}

function Said({ kind, name, text, when, href, go }: { kind: "report" | "dislike"; name: string; text: string; when?: string; href: string; go: string }) {
  return (
    <div className="flex gap-3 border-t border-line py-3">
      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${kind === "report" ? "bg-[#fdecea] text-danger" : "bg-accent-soft text-accent-active"}`} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path
            d={
              kind === "report"
                ? "M5 21V4M5 4h11l-2 4 2 4H5"
                : "M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
            }
          />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{name}</span>
        <span className="text-ink-2">{text}</span>
        {when && <span className="text-meta text-muted">{when}</span>}
      </span>
      <Link href={href} className="self-center text-meta font-semibold text-accent hover:text-accent-hover">
        {go} →
      </Link>
    </div>
  );
}
