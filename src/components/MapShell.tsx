"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CATEGORY_GROUPS, categoryLabel, type CategoryId } from "@/lib/categories";
import type { OnThisDay, PublicEventCard } from "@/lib/events/public";
import { FACEBOOK_URL } from "@/lib/links";
import { LogoBadge, Wordmark } from "./Logo";
import type { MapLang } from "@/lib/map-style";
import { dayBn } from "./OnThisDayPanel";

/*
 * The map page's own frame, floating over the map: brand, sections (মানচিত্র · আজকের দিনে),
 * map language, "আরও" (About, Privacy, Facebook); on phones a tab bar at the bottom; the
 * "On this day" card; zoom buttons; the category chips and the pin preview. The site header steps aside on this page (globals.css).
 */

const pill = "pointer-events-auto rounded-full bg-card shadow-float";
const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });

/** The round brand mark (a pin holding an "&"), on its own or inside the phone's search bar. */
export function BrandMark() {
  return <LogoBadge className="size-10" />;
}

/** Desktop: the brand pill (mark, name, tagline). Goes to the plain map. */
export function Brand() {
  return (
    <Link href="/" className={`${pill} hidden h-[52px] items-center gap-2.5 ps-1.5 pe-5 md:flex`} aria-label="Place & Past — মানচিত্রে ফিরুন">
      <BrandMark />
      <span className="flex flex-col leading-tight">
        <Wordmark className="text-lg" />
        <span className="text-micro text-muted">প্রতিটি জায়গারই অতীত আছে</span>
      </span>
    </Link>
  );
}

/** Which section is showing: the plain map, a collection on it, or "On this day". */
export type MapSection = "map" | "collections" | "otd";

/** Desktop: the sections, as one pill. */
export function SectionNav({ section, onMap, onCollections, onOtd }: { section: MapSection; onMap: () => void; onCollections: () => void; onOtd: () => void }) {
  const item = "flex h-11 items-center rounded-full px-4 text-body transition-colors";
  const cls = (on: boolean) => `${item} ${on ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-hover hover:text-ink"}`;
  return (
    <nav aria-label="বিভাগ" className={`${pill} hidden gap-1 p-1 md:flex`}>
      <button type="button" onClick={onMap} aria-current={section === "map" ? "page" : undefined} className={cls(section === "map")}>
        মানচিত্র
      </button>
      <button type="button" onClick={onCollections} aria-current={section === "collections" ? "page" : undefined} className={cls(section === "collections")}>
        সংগ্রহ
      </button>
      <button type="button" onClick={onOtd} aria-current={section === "otd" ? "page" : undefined} className={cls(section === "otd")}>
        আজকের দিনে
      </button>
    </nav>
  );
}

/** বাংলা | EN for the map's place names. */
export function LangSwitch({ lang, onChange, className = "" }: { lang: MapLang; onChange: (l: MapLang) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="মানচিত্রের নামের ভাষা" className={`flex gap-0.5 rounded-full bg-card p-1 ${className}`}>
      {(["bn", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => onChange(l)}
          className={`h-10 min-w-11 rounded-full px-3 text-meta font-semibold transition-colors ${lang === l ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}
        >
          {l === "bn" ? "বাংলা" : "EN"}
        </button>
      ))}
    </div>
  );
}

/** The links that don't need a place in the bar: About, Privacy, Facebook (and, on phones, the map language). */
function MoreLinks({ lang, onLang }: { lang?: MapLang; onLang?: (l: MapLang) => void }) {
  const item = "flex h-12 items-center gap-3 rounded-xl px-3 text-body text-ink transition-colors hover:bg-hover";
  return (
    <>
      <Link href="/about" className={item}>
        <span className="rounded-full border border-accent/40 bg-accent-soft px-1.5 text-micro font-semibold text-accent">✦ AI</span>
        আমাদের কথা
      </Link>
      <Link href="/privacy" className={item}>
        গোপনীয়তা নীতি
      </Link>
      <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" className={item}>
        Facebook-এ Place &amp; Past ↗
      </a>
      {lang && onLang && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 pt-3 pb-1">
          <span className="text-meta text-muted">মানচিত্রের নাম</span>
          <LangSwitch lang={lang} onChange={onLang} className="bg-hover" />
        </div>
      )}
    </>
  );
}

/** A menu that closes on outside taps and Escape (Escape stays with the menu). */
function useDismiss(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, close]);
  return box;
}

/** Desktop: "আরও" (⋯) with About, Privacy and Facebook. */
export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const box = useDismiss(open, () => setOpen(false));
  return (
    <div ref={box} className="pointer-events-auto relative hidden md:block">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="আরও" className={`${pill} grid size-[52px] place-items-center text-ink-2 hover:text-ink`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-40 mt-2 w-60 animate-[rise_.15s_var(--ease-out)] rounded-2xl bg-card p-1.5 shadow-menu">
          <MoreLinks />
        </div>
      )}
    </div>
  );
}

const TAB_ICONS = {
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  otd: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
  collections: "M4 7h16M6 4h12M3 10h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

/** Phones: the tab bar (মানচিত্র · সংগ্রহ · আজকের দিনে · আরও). Hidden while a place or the day's list is open. */
export function TabBar({ section, onMap, onCollections, onOtd, lang, onLang }: { section: MapSection; onMap: () => void; onCollections: () => void; onOtd: () => void; lang: MapLang; onLang: (l: MapLang) => void }) {
  const [more, setMore] = useState(false);
  const box = useDismiss(more, () => setMore(false));
  const tab = "flex flex-col items-center justify-center gap-0.5 text-micro";
  const icon = (d: string, on = false) => (
    <span className={`grid h-8 w-14 place-items-center rounded-full ${on ? "bg-accent-soft" : ""}`}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={d === TAB_ICONS.more ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  );
  return (
    <div ref={box} className="md:hidden">
      {more && (
        <div role="menu" className="fixed inset-x-3 bottom-[calc(var(--tabbar-h)+0.5rem)] z-40 animate-[rise_.15s_var(--ease-out)] rounded-2xl bg-card p-1.5 shadow-menu">
          <MoreLinks lang={lang} onLang={onLang} />
        </div>
      )}
      <nav aria-label="বিভাগ" className="fixed inset-x-0 bottom-0 z-30 grid h-[var(--tabbar-h)] grid-cols-4 border-t border-line bg-card px-2 pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={onMap} aria-current={section === "map" ? "page" : undefined} className={`${tab} ${section === "map" ? "font-semibold text-accent" : "text-muted"}`}>
          {icon(TAB_ICONS.map, section === "map")}
          মানচিত্র
        </button>
        <button type="button" onClick={onCollections} aria-current={section === "collections" ? "page" : undefined} className={`${tab} ${section === "collections" ? "font-semibold text-accent" : "text-muted"}`}>
          {icon(TAB_ICONS.collections, section === "collections")}
          সংগ্রহ
        </button>
        <button type="button" onClick={onOtd} className={`${tab} text-muted`}>
          {icon(TAB_ICONS.otd)}
          আজকের দিনে
        </button>
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} aria-haspopup="menu" className={`${tab} ${more ? "text-accent" : "text-muted"}`}>
          {icon(TAB_ICONS.more, more)}
          আরও
        </button>
      </nav>
    </div>
  );
}

/**
 * "On this day" on the map: the day's first story (or the next day that has one), and a way to
 * all of them. Nothing when there are none at all.
 */
/** The day whose card the visitor closed ("MM-DD"): it stays closed that day, and comes back the next. */
const OTD_CLOSED_KEY = "otd-card-closed";

export function OnThisDayCard({ onPick, onAll }: { onPick: (e: PublicEventCard) => void; onAll: () => void }) {
  const [day, setDay] = useState<OnThisDay | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/events/on-this-day")
      .then((r) => (r.ok ? (r.json() as Promise<OnThisDay>) : null))
      .then((d) => {
        let closed: string | null = null;
        try {
          closed = localStorage.getItem(OTD_CLOSED_KEY);
        } catch {
          // storage blocked: the card simply shows
        }
        if (live) setDay(d && closed === d.date ? null : d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const first = day?.events[0];
  if (!day || !first) return null;
  const more = day.events.length - 1;
  const close = () => {
    try {
      localStorage.setItem(OTD_CLOSED_KEY, day.date);
    } catch {
      // storage blocked: closed for this visit only
    }
    setDay(null);
  };
  return (
    <section
      aria-label="আজকের দিনে"
      className="pointer-events-auto w-full animate-[rise_.3s_var(--ease-out)] rounded-[1.25rem] bg-card p-3 shadow-menu md:w-[380px] md:p-4"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-micro font-semibold text-accent">
          {day.next ? "পরের ঘটনা" : "আজকের দিনে"} · {dayBn(day.shown)}
        </p>
        <span className="flex items-center gap-1">
          <button type="button" onClick={onAll} className="text-micro font-semibold text-accent hover:text-accent-hover">
            {more > 0 ? `আরও ${bn(more)}টি →` : "সব দেখুন →"}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="আজকের দিনের কার্ড বন্ধ করুন"
            title="বন্ধ করুন (কাল আবার দেখা যাবে)"
            className="-my-2 -me-2 grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </button>
        </span>
      </div>
      <button type="button" onClick={() => onPick(first)} className="mt-2 flex w-full items-center gap-3 rounded-xl p-1 text-start transition-colors hover:bg-hover">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-body font-bold text-accent">{first.year ? bn(first.year) : "—"}</span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-body leading-snug font-bold">{first.title}</span>
          <span className="block truncate text-meta text-muted">
            {[first.place_name, first.step_count > 1 ? "ধাপে ধাপে মানচিত্রে" : null].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
    </section>
  );
}

/** Desktop: zoom in / out (phones pinch). */
export function ZoomButtons({ onZoom }: { onZoom: (by: 1 | -1) => void }) {
  const b = "grid size-12 place-items-center text-ink transition-colors hover:bg-hover active:bg-pressed";
  return (
    <div className="pointer-events-auto hidden flex-col overflow-hidden rounded-2xl bg-card shadow-float md:flex">
      <button type="button" aria-label="কাছে আনুন" onClick={() => onZoom(1)} className={b}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <span className="h-px bg-line" aria-hidden />
      <button type="button" aria-label="দূরে নিন" onClick={() => onZoom(-1)} className={b}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

/** A chip's filter: one category, or places with a video. */
export type PinFilter = CategoryId | "video";

/** A kind of place among the loaded pins, and how many pins have it. */
export type PinKind = { id: CategoryId; n: number };

/** How many chips show in the row; the rest are in the "সব ধরন" panel. */
const ROW_CHIPS = 4;

/**
 * Chips under the search that filter the pins: only kinds the loaded pins have (no chip that
 * would empty the map), the commonest first, then "ভিডিও আছে". With more kinds than fit, the
 * rest are in a panel ("সব ধরন ▾"), grouped (ধর্মীয় স্থান, শহর ও স্থাপত্য…), with counts.
 * Choosing the chosen one again shows every pin.
 */
export function CategoryChips({
  kinds,
  videos,
  value,
  onChange,
  onPanel,
}: {
  kinds: PinKind[];
  videos: number;
  value: PinFilter | null;
  onChange: (f: PinFilter | null) => void;
  /** The "সব ধরন" panel opened or closed (the map hides what it would cover). */
  onPanel?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = useCallback(
    (v: boolean | ((o: boolean) => boolean)) =>
      setOpenState((o) => {
        const next = typeof v === "function" ? v(o) : v;
        if (next !== o) queueMicrotask(() => onPanel?.(next));
        return next;
      }),
    [onPanel],
  );
  // Where the desktop card goes: under the chips' row (measured when it opens).
  const rowRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ top: 0, left: 0 });
  const toggle = () => {
    const r = rowRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, left: r.left });
    setOpen((o) => !o);
  };
  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // The row: the commonest kinds (and the chosen one, wherever it is), then ভিডিও.
  const row = kinds.slice(0, ROW_CHIPS);
  const chosen = kinds.find((k) => k.id === value);
  if (chosen && !row.includes(chosen)) row.push(chosen);
  const chips: { id: PinFilter; label: string }[] = [
    ...row.map((k) => ({ id: k.id as PinFilter, label: categoryLabel(k.id) })),
    ...(videos ? [{ id: "video" as const, label: "▶ ভিডিও আছে" }] : []),
  ];
  const more = kinds.length > ROW_CHIPS;
  if (chips.length === 0) return null;
  const pick = (f: PinFilter) => {
    onChange(f === value ? null : f);
    setOpen(false);
  };
  const chip = "h-9 shrink-0 rounded-full px-3.5 text-meta font-semibold whitespace-nowrap shadow-float transition-colors";
  const count = new Map(kinds.map((k) => [k.id, k.n]));
  return (
    <div className="relative">
      <div ref={rowRef} role="group" aria-label="জায়গার ধরন" className="no-scrollbar pointer-events-auto -mx-3 mt-2 flex w-fit max-w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 pb-2 md:mx-0 md:max-w-full md:px-0">
        {value && (
          <button type="button" onClick={() => onChange(null)} className={`${chip} bg-card text-ink-2 hover:text-ink`}>
            সব
          </button>
        )}
        {chips.map((c) => {
          const on = c.id === value;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(c.id)}
              className={`${chip} ${on ? "bg-accent text-on-accent hover:bg-accent-hover" : "bg-card text-ink hover:bg-hover"}`}
            >
              {c.label}
            </button>
          );
        })}
        {more && (
          <button
            type="button"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={toggle}
            className={`${chip} flex items-center gap-1 ${open ? "bg-accent-soft text-accent" : "bg-card text-ink-2 hover:bg-hover hover:text-ink"}`}
          >
            সব ধরন
            <svg viewBox="0 0 20 20" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 8 5 5 5-5" />
            </svg>
          </button>
        )}
      </div>

      {open &&
        // On the page itself (over the tab bar and everything else): phones get a sheet from the
        // bottom over a dimmed map; desktop a card under the chips' row.
        createPortal(
        <div className="fixed inset-0 z-[60]">
          <button type="button" aria-label="বন্ধ করুন" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/35 md:bg-transparent" />
          <div
            role="dialog"
            aria-label="সব ধরন"
            style={{ "--top": `${at.top}px`, "--left": `${at.left}px` } as React.CSSProperties}
            className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-3xl bg-card px-5 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float md:inset-x-auto md:top-[var(--top)] md:left-[var(--left)] md:bottom-auto md:max-h-[min(70dvh,560px)] md:w-[22rem] md:rounded-3xl md:pb-5"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong md:hidden" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-body font-semibold">জায়গার ধরন</p>
              {value && (
                <button type="button" onClick={() => pick(value)} className="text-meta font-semibold text-accent hover:underline">
                  সব দেখান
                </button>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {videos > 0 && <PanelGroup title="বিশেষ" items={[{ id: "video", label: "▶ ভিডিও আছে", n: videos }]} value={value} onPick={pick} />}
              {CATEGORY_GROUPS.map((g) => {
                const items = g.ids.filter((id) => count.has(id)).map((id) => ({ id: id as PinFilter, label: categoryLabel(id), n: count.get(id)! }));
                return items.length ? <PanelGroup key={g.bn} title={g.bn} items={items} value={value} onPick={pick} /> : null;
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** One group in the "সব ধরন" panel: its name, then its kinds with how many places each. */
function PanelGroup({ title, items, value, onPick }: { title: string; items: { id: PinFilter; label: string; n: number }[]; value: PinFilter | null; onPick: (f: PinFilter) => void }) {
  return (
    <section>
      <h3 className="mb-1.5 text-micro font-semibold text-muted">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => {
          const on = it.id === value;
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(it.id)}
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-meta transition-colors ${on ? "border-accent bg-accent font-semibold text-on-accent" : "border-line text-ink hover:bg-hover"}`}
            >
              {it.label}
              <span className={on ? "text-on-accent/80" : "text-muted"}>{bn(it.n)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** What the hover preview shows for a pin. */
export type PinPreviewData = { label: string; line?: string; thumb?: string; verified: boolean; likes?: number; x: number; y: number; below: boolean };

/** Desktop: pointing at a pin shows a small card (picture, what it is, likes) before clicking. */
export function PinPreview({ p }: { p: PinPreviewData }) {
  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 w-64 animate-[fadein_.12s_ease] overflow-hidden rounded-2xl bg-card shadow-menu"
      style={{ transform: `translate(calc(${p.x}px - 50%), calc(${p.y}px ${p.below ? "+ 18px" : "- 100% - 18px"}))` }}
    >
      {p.thumb && (
        // eslint-disable-next-line @next/next/no-img-element -- a small outside picture (Commons / YouTube)
        <img src={p.thumb} alt="" onError={(e) => (e.currentTarget.hidden = true)} className="aspect-video w-full bg-hover object-cover" />
      )}
      <div className="p-3">
        <p className="line-clamp-2 text-body leading-snug font-bold">{p.label}</p>
        {p.line && <p className="mt-0.5 truncate text-meta text-muted">{p.line}</p>}
        <p className="mt-2 flex items-center gap-2.5 text-meta">
          {!!p.likes && <span className="text-ink-2">👍 {p.likes.toLocaleString("bn-BD")}</span>}
          <span className="ms-auto font-semibold text-accent">বিস্তারিত →</span>
        </p>
      </div>
    </div>
  );
}
