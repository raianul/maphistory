"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OnThisDay, PublicEventCard } from "@/lib/events/public";
import { FACEBOOK_URL } from "@/lib/links";
import type { MapLang } from "@/lib/map-style";
import { dayBn } from "./OnThisDayPanel";

/*
 * The map page's own frame, floating over the map: brand, sections (মানচিত্র · আজকের দিনে),
 * map language, "আরও" (About, Privacy, Facebook); on phones a tab bar at the bottom; the
 * "On this day" card; zoom buttons. The site header steps aside on this page (globals.css).
 */

const pill = "pointer-events-auto rounded-full bg-card shadow-float";
const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });

/** The round brand mark (a pin), on its own or inside the phone's search bar. */
export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-accent text-on-accent ${size === "sm" ? "size-10" : "size-10"}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    </span>
  );
}

/** Desktop: the brand pill (mark, name, tagline). Goes to the plain map. */
export function Brand() {
  return (
    <Link href="/" className={`${pill} hidden h-[52px] items-center gap-2.5 ps-1.5 pe-5 md:flex`} aria-label="Ondor — মানচিত্রে ফিরুন">
      <BrandMark />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold tracking-tight">Ondor</span>
        <span className="text-micro text-muted">প্রতিটি জায়গারই অতীত আছে</span>
      </span>
    </Link>
  );
}

/** Desktop: the sections, as one pill. */
export function SectionNav({ onThisDay, onMap, onOtd }: { onThisDay: boolean; onMap: () => void; onOtd: () => void }) {
  const item = "flex h-11 items-center rounded-full px-4 text-body transition-colors";
  return (
    <nav aria-label="বিভাগ" className={`${pill} hidden gap-1 p-1 md:flex`}>
      <button type="button" onClick={onMap} aria-current={!onThisDay ? "page" : undefined} className={`${item} ${!onThisDay ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-hover hover:text-ink"}`}>
        মানচিত্র
      </button>
      <button type="button" onClick={onOtd} aria-current={onThisDay ? "page" : undefined} className={`${item} ${onThisDay ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-hover hover:text-ink"}`}>
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
        Facebook-এ Ondor ↗
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
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

/** Phones: the tab bar (মানচিত্র · আজকের দিনে · আরও). Hidden while a place or the day's list is open. */
export function TabBar({ onMap, onOtd, lang, onLang }: { onMap: () => void; onOtd: () => void; lang: MapLang; onLang: (l: MapLang) => void }) {
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
      <nav aria-label="বিভাগ" className="fixed inset-x-0 bottom-0 z-30 grid h-[var(--tabbar-h)] grid-cols-3 border-t border-line bg-card px-2 pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={onMap} aria-current="page" className={`${tab} font-semibold text-accent`}>
          {icon(TAB_ICONS.map, true)}
          মানচিত্র
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
export function OnThisDayCard({ onPick, onAll }: { onPick: (e: PublicEventCard) => void; onAll: () => void }) {
  const [day, setDay] = useState<OnThisDay | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/events/on-this-day")
      .then((r) => (r.ok ? (r.json() as Promise<OnThisDay>) : null))
      .then((d) => live && setDay(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const first = day?.events[0];
  if (!day || !first) return null;
  const more = day.events.length - 1;
  return (
    <section
      aria-label="আজকের দিনে"
      className="pointer-events-auto w-full animate-[rise_.3s_var(--ease-out)] rounded-[1.25rem] bg-card p-3 shadow-menu md:w-[380px] md:p-4"
    >
      <div className="flex items-baseline justify-between gap-2 px-1">
        <p className="text-micro font-semibold text-accent">
          {day.next ? "পরের ঘটনা" : "আজকের দিনে"} · {dayBn(day.shown)}
        </p>
        <button type="button" onClick={onAll} className="text-micro font-semibold text-accent hover:text-accent-hover">
          {more > 0 ? `আরও ${bn(more)}টি →` : "সব দেখুন →"}
        </button>
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
