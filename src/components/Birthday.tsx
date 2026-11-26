"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "@/lib/analytics";
import { siteUrl } from "@/lib/site";

/*
 * "আপনার জন্মদিনে বাংলাদেশে কী ঘটেছিল": pick a day and month, see that day's events, share the
 * link (its preview is the card) or download the card as an image for a story. Used on its own
 * page (/birthday) and in the first-visit pop-up over the map. Nothing about the visitor is sent
 * anywhere but the date itself.
 */

const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });
const daysIn = (month: number) => new Date(Date.UTC(2000, month, 0)).getUTCDate();
const md = (month: number, day: number) => `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
export const birthdayLabel = (month: number, day: number) => `${bn(day)} ${MONTHS_BN[month - 1]}`;

type Event = { year: number; title_bn: string; summary_bn: string; place: string; source_url: string };
type State = { step: "pick" } | { step: "loading"; month: number; day: number } | { step: "result"; month: number; day: number; events: Event[] } | { step: "error"; message: string };

export function BirthdayFinder({ initial, onDone, doneLabel = "মানচিত্রে যান →" }: { initial?: { month: number; day: number }; onDone?: () => void; doneLabel?: string }) {
  const [month, setMonth] = useState(initial?.month ?? 1);
  const [day, setDay] = useState(initial?.day ?? 1);
  const [state, setState] = useState<State>(initial ? { step: "loading", ...initial } : { step: "pick" });

  async function look(m: number, d: number) {
    setState({ step: "loading", month: m, day: d });
    track("birthday_lookup", { date: md(m, d) });
    const r = await fetch(`/api/birthday/${md(m, d)}`).catch(() => null);
    const data = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setState({ step: "error", message: data.error ?? "এখন খোঁজা গেল না। একটু পরে আবার চেষ্টা করুন।" });
    setState({ step: "result", month: m, day: d, events: data.events ?? [] });
  }

  // A shared link (/birthday/12-16): its day, right away.
  useEffect(() => {
    if (initial) queueMicrotask(() => look(initial.month, initial.day));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the link's own day
  }, []);

  if (state.step === "result") return <Result {...state} onAgain={() => setState({ step: "pick" })} onDone={onDone} doneLabel={doneLabel} />;

  const field = "h-12 rounded-xl border border-line bg-card px-3 text-body outline-none focus:border-accent";
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="text-5xl" aria-hidden>
        🎂
      </span>
      <div>
        <h2 className="text-display font-bold tracking-tight text-balance">আপনার জন্মদিনে বাংলাদেশে কী ঘটেছিল?</h2>
        <p className="mt-1 text-meta text-muted">শুধু দিন আর মাস দিন, দেখুন সেই দিনের ইতিহাস।</p>
      </div>
      {state.step === "loading" ? (
        <div className="flex flex-col items-center gap-3 py-4" role="status" aria-live="polite">
          <span className="size-8 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" aria-hidden />
          <p className="font-semibold">{birthdayLabel(state.month, state.day)}-এর ইতিহাস খোঁজা হচ্ছে…</p>
          <p className="max-w-xs text-meta text-muted">প্রথমবার কোনো দিন খুঁজতে আধা মিনিটের মতো লাগতে পারে।</p>
        </div>
      ) : (
        <form
          className="flex w-full max-w-sm flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            look(month, Math.min(day, daysIn(month)));
          }}
        >
          <div className="grid grid-cols-[1fr_1.6fr] gap-2">
            <label className="flex flex-col gap-1 text-start">
              <span className="text-micro font-semibold text-muted">দিন</span>
              <select id="bday-day" value={day} onChange={(e) => setDay(Number(e.target.value))} className={field}>
                {Array.from({ length: daysIn(month) }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {bn(i + 1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-start">
              <span className="text-micro font-semibold text-muted">মাস</span>
              <select id="bday-month" value={month} onChange={(e) => setMonth(Number(e.target.value))} className={field}>
                {MONTHS_BN.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="h-12 rounded-full bg-accent font-semibold text-on-accent transition-colors hover:bg-accent-hover">
            দেখুন
          </button>
          {state.step === "error" && <p className="text-meta text-danger">{state.message}</p>}
          {onDone && (
            <button type="button" onClick={onDone} className="mt-1 text-meta text-muted underline hover:text-ink">
              পরে, মানচিত্রে যাই
            </button>
          )}
        </form>
      )}
    </div>
  );
}

function Result({ month, day, events, onAgain, onDone, doneLabel }: { month: number; day: number; events: Event[]; onAgain: () => void; onDone?: () => void; doneLabel: string }) {
  const [note, setNote] = useState<string | null>(null);
  const date = md(month, day);
  const url = siteUrl(`/birthday/${date}`);
  const title = `${birthdayLabel(month, day)}-এ জন্ম? সেই দিনে বাংলাদেশে যা ঘটেছিল`;

  async function share() {
    track("birthday_share", { date });
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch {
        // cancelled, or not allowed: fall back to Facebook below
      }
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank", "noopener,width=640,height=560");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNote("লিংক কপি হয়েছে");
    } catch {
      setNote(url);
    }
  }

  async function download() {
    track("birthday_download", { date });
    setNote("ছবি তৈরি হচ্ছে…");
    const r = await fetch(`/og/birthday/${date}?format=story`).catch(() => null);
    if (!r?.ok) return setNote("ছবি তৈরি করা গেল না");
    const blob = await r.blob();
    const file = new File([blob], `placeandpast-birthday-${date}.png`, { type: "image/png" });
    // Phones: straight into the share sheet (Facebook, Instagram story, WhatsApp…); otherwise a download.
    if (navigator.canShare?.({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ files: [file], title, text: url });
        setNote(null);
        return;
      } catch {
        // cancelled: download instead
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setNote("ছবি ডাউনলোড হয়েছে");
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="text-center">
        <p className="text-meta font-semibold text-accent">আপনার জন্মদিনে বাংলাদেশে</p>
        <h2 className="text-display font-bold tracking-tight">{birthdayLabel(month, day)}-এ জন্ম?</h2>
        <p className="text-meta text-muted">{events.length ? "সেই দিনে যা ঘটেছিল" : "এই দিনের কোনো ঘটনা এখনো খুঁজে পাওয়া যায়নি।"}</p>
      </header>
      {events.length > 0 && (
        <ol className="grid gap-2">
          {events.map((e) => (
            <li key={`${e.year}${e.title_bn}`} className="flex gap-3 rounded-2xl bg-card p-3 text-start">
              <span className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-accent-soft text-body font-bold text-accent">{bn(e.year)}</span>
              <span className="min-w-0">
                <span className="block font-semibold leading-snug">{e.title_bn}</span>
                {e.summary_bn && <span className="mt-0.5 line-clamp-2 block text-meta text-ink-2">{e.summary_bn}</span>}
                <span className="mt-0.5 block text-micro text-muted">
                  {e.place}
                  {e.source_url && (
                    <>
                      {e.place ? " · " : ""}
                      <a href={e.source_url} target="_blank" rel="noreferrer" className="underline hover:text-accent">
                        সূত্র
                      </a>
                    </>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={share} className="h-12 rounded-full bg-accent font-semibold text-on-accent transition-colors hover:bg-accent-hover">
          শেয়ার করুন
        </button>
        <button type="button" onClick={download} className="h-12 rounded-full bg-accent-soft font-semibold text-accent transition-colors hover:bg-accent-soft-hover">
          ছবি ডাউনলোড
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-meta">
        <button type="button" onClick={copy} className="font-semibold text-accent hover:underline">
          লিংক কপি
        </button>
        <button type="button" onClick={onAgain} className="font-semibold text-accent hover:underline">
          অন্য তারিখ দেখুন
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="font-semibold text-accent hover:underline">
            {doneLabel}
          </button>
        )}
      </div>
      {note && <p className="text-center text-meta text-muted break-all">{note}</p>}
      <p className="text-center text-micro text-muted">AI (Google Gemini) দিয়ে খুঁজে বের করা; ভুল থাকতে পারে।</p>
    </div>
  );
}

/** Shown once (this browser), over the map on a first visit to the plain home page. */
const SEEN_KEY = "birthday-popup-seen";

export function BirthdayPopup() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Only the plain map: a shared place, collection, event or day link goes straight to it.
    const p = new URLSearchParams(window.location.search);
    if (window.location.pathname !== "/" || ["place", "collection", "event", "day"].some((k) => p.has(k))) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem(SEEN_KEY);
      if (!seen) localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // storage blocked: don't show it (it would come back on every visit)
    }
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open) return null;
  const close = () => setOpen(false);
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto p-4">
      <button type="button" aria-label="বন্ধ করুন" onClick={close} className="fixed inset-0 bg-black/45" />
      <div role="dialog" aria-modal="true" aria-label="জন্মদিনে কী ঘটেছিল" className="relative w-full max-w-md animate-[rise_.3s_var(--ease-out)] rounded-3xl bg-paper p-5 shadow-float md:p-7">
        <button type="button" onClick={close} aria-label="বন্ধ করুন" className="absolute end-3 top-3 grid size-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M5 5l10 10M15 5 5 15" />
          </svg>
        </button>
        <BirthdayFinder onDone={close} />
      </div>
    </div>,
    document.body,
  );
}
