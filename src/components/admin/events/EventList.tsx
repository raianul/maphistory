"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bnYear } from "@/lib/format";
import { EVENT_STATUSES, STATUS_BN, type EventListRow, type EventStatus } from "@/lib/events/schema";
import { adminFetch, browserSupabase } from "@/lib/supabase-browser";
import { dateBn, StatusBadge } from "./shared";

const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const field = "h-10 rounded-control border border-line-strong bg-card px-3 text-meta outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";

/** /admin/events: every historical event, with search and filters, and a way to start a new one. */
export function EventList({ email }: { email?: string }) {
  const [rows, setRows] = useState<EventListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<EventStatus | "">("");
  const [month, setMonth] = useState("");
  const [country, setCountry] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
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
  }, [q, status, month, country]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-meta text-muted hover:text-ink">
          ← অ্যাডমিন মানচিত্র
        </Link>
        <h1 className="text-display font-bold tracking-tight">ঐতিহাসিক ঘটনা</h1>
        <span className="ms-auto flex items-center gap-3 text-meta text-muted">
          {email}
          <button type="button" onClick={() => browserSupabase().auth.signOut()} className="hover:text-ink hover:underline">
            লগআউট
          </button>
        </span>
      </header>
      <p className="mt-1 text-meta text-muted">সম্পাদকের হাতে তৈরি ও যাচাই করা ঘটনা। প্রকাশিত হলেই কেবল দর্শকেরা দেখবেন।</p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="শিরোনাম, স্থান বা স্লাগ খুঁজুন…" className={`${field} min-w-56 flex-1`} aria-label="খুঁজুন" />
        <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus | "")} className={field} aria-label="অবস্থা">
          <option value="">সব অবস্থা</option>
          {EVENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_BN[s]}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={field} aria-label="মাস">
          <option value="">সব মাস</option>
          {MONTHS_BN.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="দেশ (BD)" maxLength={2} className={`${field} w-24 uppercase`} aria-label="দেশ" />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-10 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent transition-colors hover:bg-accent-hover"
        >
          + নতুন ঘটনা
        </button>
      </div>

      {creating && <NewEvent onCancel={() => setCreating(false)} />}

      {error && <p className="mt-4 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{error}</p>}

      <ul className="mt-5 divide-y divide-line rounded-2xl bg-card shadow-float">
        {rows === null && !error && <li className="p-4 text-meta text-muted">লোড হচ্ছে…</li>}
        {rows?.length === 0 && <li className="p-4 text-meta text-muted">কোনো ঘটনা পাওয়া যায়নি।</li>}
        {rows?.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/events/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-hover">
              <span className="w-36 shrink-0 text-meta text-ink-2 tabular-nums">{dateBn(r)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.title}</span>
                <span className="block truncate text-meta text-muted">
                  {[r.place_name, r.city, r.country].filter(Boolean).join(" · ") || "স্থান দেওয়া হয়নি"}
                  {r.recurring && " · প্রতি বছর"}
                </span>
              </span>
              <span className="text-micro text-muted">সূত্র {bnYear(r.source_count)}</span>
              <StatusBadge status={r.status} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
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
    <form onSubmit={create} className="mt-4 grid gap-3 rounded-2xl bg-card p-4 shadow-float md:grid-cols-[1fr_1fr_auto] md:items-end">
      <label className="grid gap-1 text-meta">
        শিরোনাম
        <input required value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="যেমন: ভাষা আন্দোলন" autoFocus />
      </label>
      <label className="grid gap-1 text-meta">
        স্লাগ (লিংকের জন্য, ইংরেজিতে)
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
          {busy ? "তৈরি হচ্ছে…" : "তৈরি করুন"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-full px-3 text-meta text-muted hover:text-ink">
          বাতিল
        </button>
      </div>
      {error && <p className="text-meta text-danger md:col-span-3">{error}</p>}
    </form>
  );
}
