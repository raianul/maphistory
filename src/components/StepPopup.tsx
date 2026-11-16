"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { PublicEvent } from "@/lib/events/public";
import { drawnPosition } from "@/lib/events/draw";
import { PHASE_PALETTE, type TimelineStep } from "@/lib/events/schema";
import { STEP_REQUEST, StepContent } from "./OnThisDayPanel";

const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });
const CARD_W = 340;
const GAP = 22; // from the pin's centre to the card's edge

/**
 * Wide screens: the current timeline step as a card on the map, beside its numbered pin. It follows
 * the pin as the map moves; when the pin is off the visible map, or the step has no place, the
 * card sits in the map's top-left corner instead. ‹ › and Escape-free: the panel's list and the
 * pins also move between steps (all through STEP_REQUEST).
 */
export function StepPopup({ map, event, step, rightInset }: { map: MLMap; event: PublicEvent; step: number; rightInset: number }) {
  const s = event.steps[step];
  const card = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  // Closed with ×: hidden until a step is chosen again (a pin, the list or the panel), even the same one.
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const reopen = () => setClosed(false);
    window.addEventListener(STEP_REQUEST, reopen);
    return () => window.removeEventListener(STEP_REQUEST, reopen);
  }, []);
  const [shownStep, setShownStep] = useState(step);
  if (shownStep !== step) {
    setShownStep(step);
    setClosed(false);
  }
  const placed = !!s && s.map_type !== "none" && s.location_precision !== "unknown" && s.lat !== null && s.lng !== null;

  // Follow the pin, every frame while the map moves: positioned directly (no re-render per frame).
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const corner = () => {
      el.style.left = "16px";
      el.style.top = "132px";
      if (arrow.current) arrow.current.hidden = true;
    };
    const update = () => {
      if (!placed) return corner();
      // The pin as drawn (spread apart from its neighbours when they overlap).
      const p = map.project(drawnPosition(map, event.steps as unknown as TimelineStep[], step) ?? [s.lng!, s.lat!]);
      const box = map.getContainer().getBoundingClientRect();
      const free = box.width - rightInset;
      const h = el.offsetHeight || 260;
      // Off the visible map (behind the panel or outside): the corner instead.
      if (p.x < 0 || p.y < 0 || p.x > free || p.y > box.height) return corner();
      const right = p.x + GAP + CARD_W + 12 <= free;
      const left = right ? p.x + GAP : Math.max(12, p.x - GAP - CARD_W);
      // Below the floating search bar (it ends ~120px down), above the bottom edge.
      const minTop = 132;
      const top = Math.min(Math.max(minTop, p.y - h / 2), Math.max(minTop, box.height - h - 40));
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      const a = arrow.current;
      if (a) {
        a.hidden = false;
        a.style.left = right ? "-6px" : "";
        a.style.right = right ? "" : "-6px";
        a.style.top = `${Math.min(Math.max(16, p.y - top), h - 16)}px`;
      }
    };
    update();
    map.on("move", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      map.off("move", update);
      ro.disconnect();
    };
  }, [map, s, placed, rightInset, event, step, closed]);

  if (!s || closed) return null;
  const n = event.steps.length;
  const phase = event.phases.find((p) => p.id === s.phase_id);
  const color = PHASE_PALETTE[phase?.color ?? "purple"].hex;
  const go = (i: number) => window.dispatchEvent(new CustomEvent(STEP_REQUEST, { detail: i }));

  return (
    <div
      ref={card}
      role="dialog"
      aria-label={`ধাপ ${bn(step + 1)}: ${s.title}`}
      className="pointer-events-auto absolute z-20 hidden max-h-[min(70vh,560px)] flex-col rounded-2xl bg-card shadow-menu md:flex"
      style={{ width: CARD_W, left: 16, top: 132 }}
    >
      {/* Pointer to the pin. */}
      <span ref={arrow} aria-hidden hidden className="absolute size-3 -translate-y-1/2 rotate-45 bg-card" />
      <div className="h-1 shrink-0 rounded-t-2xl" style={{ background: color }} aria-hidden />
      <button
        type="button"
        onClick={() => setClosed(true)}
        aria-label="বন্ধ করুন"
        className="absolute end-2 top-3 z-10 grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <div className="overflow-y-auto p-4 pe-11 pb-2">
        {!placed && <p className="mb-2 rounded-full bg-hover px-2.5 py-0.5 text-micro text-ink-2">এই ধাপের স্থান মানচিত্রে নেই</p>}
        <StepContent e={event} step={step} compact />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line p-2">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => go(step - 1)}
          className="h-9 flex-1 rounded-full bg-hover text-meta font-semibold text-ink-2 transition-colors hover:bg-pressed disabled:opacity-40"
        >
          ‹ আগের
        </button>
        <span className="text-micro text-muted tabular-nums">
          {bn(step + 1)} / {bn(n)}
        </span>
        <button
          type="button"
          disabled={step === n - 1}
          onClick={() => go(step + 1)}
          className="h-9 flex-1 rounded-full bg-accent text-meta font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          পরের ›
        </button>
      </div>
    </div>
  );
}
