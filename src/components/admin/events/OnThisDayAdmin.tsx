"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bnYear } from "@/lib/format";
import { STATUS_BN, todayInDhaka, type EventStatus } from "@/lib/events/schema";
import { adminFetch } from "@/lib/supabase-browser";
import { StatusBadge } from "./shared";

const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const COUNTRIES = [{ code: "BD", name: "বাংলাদেশ" }];
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
  existing: { id: string; title: string; status: EventStatus } | null;
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
  const days = new Date(Date.UTC(2000, month, 0)).getUTCDate();

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
      return setError(d.error ?? "ঘটনা খোঁজা যায়নি");
    }
    setResult({ candidates: d.candidates, saved: d.saved, searched_at: d.searched_at });
    const first = (d.candidates as Candidate[]).findIndex((c) => !c.existing && c.check.confirmed);
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
          setError(d.error ?? "তালিকা আনা যায়নি");
          return setState("idle");
        }
        setError(null);
        if (!d.searched_at) {
          setResult(d.saved?.length ? { candidates: [], saved: d.saved, searched_at: null } : null);
          return setState("idle");
        }
        setResult({ candidates: d.candidates, saved: d.saved, searched_at: d.searched_at });
        const first = (d.candidates as Candidate[]).findIndex((c) => !c.existing && c.check.confirmed);
        setChosen(first >= 0 ? first : null);
        setState("found");
      })
      .catch(() => !cancelled && setState("idle"));
    return () => {
      cancelled = true;
    };
  }, [day, month, country]);

  async function generate() {
    if (chosen === null || !result) return;
    const c = result.candidates[chosen];
    setState("generating");
    setError(null);
    setStage("শুরু হচ্ছে…");
    const res = await adminFetch("/api/admin/on-this-day/generate", {
      method: "POST",
      body: JSON.stringify({ day, month, country, candidate: { ...c, existing: undefined } }),
    }).catch(() => null);
    if (!res || !res.ok || !res.body) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setState("found");
      setStage(null);
      return setError(d.error ?? "খসড়া তৈরি করা যায়নি");
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
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <Link href="/admin/events" className="text-meta text-muted hover:text-ink">
        ← সব ঘটনা
      </Link>
      <h1 className="mt-2 text-display font-bold tracking-tight">আজকের দিনে</h1>
      <p className="mt-1 text-meta text-muted">তারিখ ও দেশ বেছে ঘটনা খুঁজুন, একটি বেছে নিন, AI খসড়া ও টাইমলাইন বানাবে। দেখে প্রকাশ করুন।</p>

      <form onSubmit={find} className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl bg-card p-4 shadow-float">
        <label className="grid gap-1 text-meta font-semibold text-ink-2">
          দিন
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className={field} disabled={busy}>
            {Array.from({ length: days }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {bnYear(i + 1)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-meta font-semibold text-ink-2">
          মাস
          <select
            value={month}
            onChange={(e) => {
              const m = Number(e.target.value);
              setMonth(m);
              setDay((d) => Math.min(d, new Date(Date.UTC(2000, m, 0)).getUTCDate()));
            }}
            className={field}
            disabled={busy}
          >
            {MONTHS_BN.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-meta font-semibold text-ink-2">
          দেশ
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={field} disabled={busy}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} className="h-10 rounded-full bg-accent px-5 text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {state === "finding" ? "খোঁজা হচ্ছে…" : state === "loading" ? "…" : "ঘটনা খুঁজুন"}
        </button>
        {day === today.day && month === today.month && <span className="pb-2.5 text-micro text-muted">আজ</span>}
      </form>

      {state === "finding" && (
        <p className="mt-5 flex items-center gap-2 text-meta text-accent" role="status">
          <span className="size-3.5 animate-spin rounded-full border-2 border-accent-soft-hover border-t-accent" aria-hidden />
          AI ওয়েবে খুঁজছে, তারপর প্রতিটি সূত্রের পাতা খুলে তারিখ মিলিয়ে দেখা হচ্ছে… (৩০–৬০ সেকেন্ড)
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-5 rounded-2xl bg-card p-4 shadow-float" aria-label="পাওয়া ঘটনা">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-semibold">
              {bnYear(day)} {MONTHS_BN[month - 1]}:{" "}
              {!result.searched_at
                ? "এই দিনের এখনো খোঁজা হয়নি"
                : result.candidates.length
                  ? `${bnYear(result.candidates.length)}টি ঘটনা পাওয়া গেছে`
                  : "নির্ভরযোগ্য কোনো ঘটনা পাওয়া যায়নি"}
            </h2>
            {result.searched_at && (
              <span className="text-micro text-muted">
                খোঁজা হয়েছে {new Date(result.searched_at).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                {" · "}
                <button type="button" disabled={busy} onClick={() => load("fresh")} className="font-semibold text-accent hover:underline disabled:opacity-50">
                  আবার খুঁজুন
                </button>
              </span>
            )}
          </div>
          {result.searched_at && !result.candidates.length && <p className="mt-1 text-meta text-muted">অন্য তারিখ চেষ্টা করুন, বা পরে আবার খুঁজুন।</p>}
          {!result.searched_at && <p className="mt-1 text-meta text-muted">&ldquo;ঘটনা খুঁজুন&rdquo; চাপলে AI খুঁজবে; ফলাফল এই দিনের জন্য সংরক্ষিত থাকবে।</p>}
          <ul className="mt-3 grid gap-2">
            {result.candidates.map((c, i) => (
              <li key={`${c.year}-${c.title_bn}`}>
                <label
                  className={`flex cursor-pointer gap-3 rounded-control border p-3 transition-colors ${chosen === i ? "border-accent bg-accent-soft/40" : "border-line hover:bg-hover"} ${c.existing ? "cursor-default opacity-80" : ""}`}
                >
                  <input type="radio" name="event" className="mt-1 accent-[var(--accent)]" checked={chosen === i} disabled={!!c.existing || busy} onChange={() => setChosen(i)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold tabular-nums text-ink-2">{bnYear(c.year)}</span>
                      <span className="font-semibold">{c.title_bn}</span>
                    </span>
                    {c.summary_bn && <span className="mt-0.5 block text-meta text-ink-2">{c.summary_bn}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro">
                      {c.check.confirmed ? (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success" title={c.check.reason}>
                          ✓ সূত্রে তারিখ মিলেছে
                        </span>
                      ) : (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning" title={c.check.reason}>
                          ⚠ নিশ্চিত করা যায়নি
                        </span>
                      )}
                      <a href={c.source_url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                        {host(c.source_url)} ↗
                      </a>
                      {c.place && <span className="text-muted">{c.place}</span>}
                    </span>
                    {!c.check.confirmed && <span className="mt-1 block text-micro text-warning">{c.check.reason}। লিংক খুলে নিজে দেখে নিন।</span>}
                    {c.existing && (
                      <span className="mt-1 flex items-center gap-2 text-micro">
                        <StatusBadge status={c.existing.status} />
                        <Link href={`/admin/events/${c.existing.id}/preview`} className="font-semibold text-accent hover:underline">
                          আগেই আছে: খুলুন →
                        </Link>
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {result.saved.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-micro font-semibold text-muted">এই দিনের যেসব ঘটনা আগেই আছে</p>
              <ul className="mt-1 grid gap-1">
                {result.saved.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-meta">
                    <StatusBadge status={s.status} />
                    <Link href={`/admin/events/${s.id}/preview`} className="hover:text-accent hover:underline">
                      {s.year ? `${bnYear(s.year)} — ` : ""}
                      {s.title}
                    </Link>
                    <span className="text-micro text-muted">{STATUS_BN[s.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.candidates.some((c) => !c.existing) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={chosen === null || busy}
                onClick={generate}
                className="h-11 rounded-full bg-accent px-6 text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {state === "generating" ? "তৈরি হচ্ছে…" : "খসড়া তৈরি করুন"}
              </button>
              {stage && (
                <span className="flex items-center gap-2 text-meta text-accent" role="status" aria-live="polite">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-accent-soft-hover border-t-accent" aria-hidden />
                  {stage}
                </span>
              )}
              {!stage && chosen !== null && !result.candidates[chosen].check.confirmed && <span className="text-micro text-warning">এই ঘটনার তারিখ নিশ্চিত নয়; প্রকাশের আগে সূত্র দেখে নেবেন।</span>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
