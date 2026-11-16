"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { EventSource, HistoricalEvent, TimelineStep } from "@/lib/events/schema";
import { adminFetch } from "@/lib/supabase-browser";
import { dateBn, StatusBadge } from "./shared";
import { TimelinePreview } from "./TimelinePreview";

type Loaded = { event: HistoricalEvent; sources: EventSource[]; steps: TimelineStep[]; problems: string[] };
const btn = "h-11 rounded-full px-5 text-meta font-semibold transition-colors disabled:opacity-50";

/**
 * /admin/events/[id]/preview: the event as visitors will see it (text and the timeline on the map),
 * with the two things an admin does next: publish it (which is the admin's verification), or edit.
 */
export function EventPreview({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);
  // Notes from generation (kept in this browser tab until published).
  const [warnings] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(sessionStorage.getItem(`draft-warnings:${id}`) ?? "[]");
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  useEffect(() => {
    adminFetch(`/api/admin/events/${id}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) setData(d);
      else setError({ message: d.error ?? `HTTP ${r.status}` });
    });
  }, [id]);

  async function move(to: "published" | "review") {
    setBusy(true);
    setError(null);
    const r = await adminFetch(`/api/admin/events/${id}/status`, { method: "POST", body: JSON.stringify({ to }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError({ message: d.error ?? `HTTP ${r.status}`, problems: d.problems });
    if (to === "published") sessionStorage.removeItem(`draft-warnings:${id}`);
    setData(d);
  }

  async function remove() {
    const r = await adminFetch(`/api/admin/events/${id}`, { method: "DELETE" });
    if (r.ok) router.push("/admin/events/today");
    else setError({ message: (await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}` });
  }

  if (!data) return <p className="p-8 text-muted">{error?.message ?? "লোড হচ্ছে…"}</p>;
  const { event, sources, steps, problems } = data;
  const published = event.status === "published";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-3 text-meta">
        <Link
          href={event.event_month && event.event_day ? `/admin/events/today?day=${event.event_day}&month=${event.event_month}&country=${event.country ?? "BD"}` : "/admin/events/today"}
          className="text-muted hover:text-ink"
        >
          ← আজকের দিনে
        </Link>
        <Link href="/admin/events" className="text-muted hover:text-ink">
          সব ঘটনা
        </Link>
      </div>

      <header className="mt-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-meta text-muted">
            {dateBn(event)}
            {event.place_name && ` · ${event.place_name}`}
          </p>
          <h1 className="mt-1 text-display font-bold tracking-tight">{event.title}</h1>
        </div>
        <StatusBadge status={event.status} />
      </header>

      {/* What to do next */}
      <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-card/95 p-3 shadow-float backdrop-blur">
        {published ? (
          <>
            <span className="text-meta font-semibold text-success">✓ প্রকাশিত: দর্শকেরা দেখছেন</span>
            <Link href={`/?event=${event.slug}`} target="_blank" className={`${btn} ms-auto grid place-items-center bg-hover text-ink-2 hover:bg-pressed`}>
              সাইটে দেখুন ↗
            </Link>
            <button type="button" disabled={busy} onClick={() => move("review")} className={`${btn} bg-warning-soft text-warning hover:bg-warning-soft-hover`}>
              অপ্রকাশিত করুন
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || problems.length > 0} onClick={() => move("published")} className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}>
              {busy ? "…" : "যাচাই করে প্রকাশ করুন"}
            </button>
            <span className="text-micro text-muted">প্রকাশ মানে আপনি পড়ে দেখে নিশ্চিত করেছেন।</span>
          </>
        )}
        <Link href={`/admin/events/${id}`} className={`${btn} grid place-items-center bg-accent-soft text-accent hover:bg-accent-soft-hover ${published ? "" : "ms-auto"}`}>
          সম্পাদনা
        </Link>
        {!published &&
          (confirmDelete ? (
            <span className="flex gap-1">
              <button type="button" onClick={remove} className={`${btn} bg-danger text-white`}>
                মুছুন
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={`${btn} text-muted`}>
                বাতিল
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={`${btn} text-danger hover:bg-hover`}>
              বাদ দিন
            </button>
          ))}
      </div>

      {!published && problems.length > 0 && (
        <div className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          <p className="font-semibold">প্রকাশের আগে ঠিক করুন (সম্পাদনায় গিয়ে):</p>
          {problems.map((p) => (
            <p key={p}>• {p}</p>
          ))}
        </div>
      )}
      {!published && warnings.length > 0 && (
        <div className="mt-3 rounded-control border border-dashed border-warning/50 px-3 py-2 text-meta text-warning">
          <p className="font-semibold">AI খসড়া: দেখে নিন</p>
          {warnings.map((w) => (
            <p key={w}>• {w}</p>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          <p className="font-semibold">{error.message}</p>
          {error.problems?.map((p) => <p key={p}>• {p}</p>)}
        </div>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl bg-card p-4 shadow-float md:p-5">
          {event.summary && <p className="text-lead font-semibold leading-snug">{event.summary}</p>}
          {event.narrative && <p className="mt-3 text-body whitespace-pre-line text-ink-2">{event.narrative}</p>}
          {!event.summary && !event.narrative && <p className="text-meta text-muted">এখনো কোনো লেখা নেই।</p>}
        </section>
        <section className="rounded-2xl bg-card p-4 shadow-float md:p-5">
          <h2 className="text-meta font-semibold text-ink-2">সূত্র ({sources.length.toLocaleString("bn-BD")})</h2>
          <ul className="mt-2 grid gap-1.5 text-meta">
            {sources.map((s) => (
              <li key={s.id}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                    {s.title} ↗
                  </a>
                ) : (
                  s.title
                )}
                {s.notes && <span className="block text-micro text-muted">{s.notes}</span>}
              </li>
            ))}
            {!sources.length && <li className="text-muted">কোনো সূত্র নেই</li>}
          </ul>
        </section>
      </div>

      <section className="mt-5 rounded-2xl bg-card p-4 shadow-float md:p-5" aria-label="টাইমলাইন">
        <h2 className="font-semibold">টাইমলাইন ({steps.length.toLocaleString("bn-BD")} ধাপ)</h2>
        <p className="mt-1 text-meta text-muted">দর্শকেরা যেমন দেখবেন। ভুল স্থান বা লেখা থাকলে &ldquo;সম্পাদনা&rdquo;-তে গিয়ে ঠিক করুন।</p>
        <div className="mt-3">
          <TimelinePreview event={event} steps={steps} />
        </div>
      </section>
    </div>
  );
}
