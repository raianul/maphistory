"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Phone sheet states. `peek` shows only the top bar and the place's name, so
 * the map is free to explore; `half` is where a new place opens; `full` reads.
 * Heights are a share of the screen (peek is a fixed size, see PEEK_PX).
 */
type Snap = "peek" | "half" | "full";
const HALF = 0.56;
/** Full height stops below the floating search bar (header + search + gaps), so both stay usable. */
const FULL_GAP_PX = 128;
/** The peek sheet: handle, title row and a little breathing room (+ safe area). */
const PEEK_PX = 88;
/** Dragged below this share of the peek height, the sheet closes. */
const CLOSE_BELOW_PEEK = 0.6;
/** How long the closing slide takes (matches the panelout/sheetout animations). */
const CLOSE_MS = 180;

/** Tells the map how much of the screen the phone sheet covers (0 when closed or on wide screens). */
export const SHEET_EVENT = "jg:sheet";
/** The map asks the sheet to make room, e.g. while searching: "peek". */
export const SHEET_REQUEST = "jg:sheet-request";

const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

/**
 * Place panel over the map: a reading column on the right on wide screens, a
 * draggable bottom sheet on phones with three states (peek, half, full). Drag
 * the top bar, tap it to toggle, or drag down from peek to close. The URL is
 * the place's own URL for curated places, so closing goes back in history
 * unless an onClose is given.
 *
 * The top bar is quiet until the reader scrolls: then it shows the place's
 * name, so they always know what they are reading. In peek it always does.
 */
export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  /** Defaults to going back in history (the panel has its own URL). */
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  const [snap, setSnap] = useState<Snap>("half");
  /** Height in px while a finger is dragging; null when settled on a snap. */
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startPx: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [closing, setClosing] = useState(false);

  /** Slides the panel out, then closes it for real. */
  function close() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => (onClose ?? (() => router.back()))(), CLOSE_MS);
  }

  useEffect(() => {
    // Escape closes the panel, unless something else used it first (e.g. closing the search results).
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A new place replaces the panel content: start it from the top, at half height, opened again if it was closing.
  const [shownTitle, setShownTitle] = useState(title);
  if (shownTitle !== title) {
    setShownTitle(title);
    setScrolled(false);
    setClosing(false);
    setSnap((s) => (s === "full" ? "full" : "half"));
  }
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [title]);

  // The map may ask for room (search opened): drop to peek. Phones only: the desktop column has no states.
  useEffect(() => {
    const onRequest = (e: Event) => !isWide() && setSnap((e as CustomEvent<Snap>).detail);
    window.addEventListener(SHEET_REQUEST, onRequest);
    return () => window.removeEventListener(SHEET_REQUEST, onRequest);
  }, []);

  // Tell the map how much screen the sheet covers once it settles, so it keeps the place in view.
  useEffect(() => {
    const el = aside.current;
    if (!el) return;
    const announce = () =>
      window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: closing || isWide() ? 0 : el.getBoundingClientRect().height }));
    const t = setTimeout(announce, 220); // after the height transition
    window.addEventListener("resize", announce);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", announce);
    };
  }, [snap, closing]);
  useEffect(() => () => void window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: 0 })), []);

  const peekPx = () => PEEK_PX + safeBottom();
  const fullPx = () => window.innerHeight - FULL_GAP_PX - safeTop();
  const snapPx = (s: Snap) => (s === "peek" ? peekPx() : s === "half" ? Math.round(window.innerHeight * HALF) : fullPx());

  function onPointerDown(e: React.PointerEvent) {
    // Only the phone sheet is draggable; buttons in the bar keep working.
    if (isWide() || (e.target as HTMLElement).closest("button")) return;
    const h = aside.current?.getBoundingClientRect().height ?? snapPx(snap);
    drag.current = { startY: e.clientY, startPx: h, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone (very short tap): the drag simply ends on pointerup
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    // Velocity (px/ms, positive = downward) for flick gestures.
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragPx(Math.min(fullPx() + 24, Math.max(40, d.startPx - dy)));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    const h = dragPx;
    setDragPx(null);
    if (!d) return;
    if (!d.moved || h === null) {
      // A tap on the bar: peek and half open fully; full goes back to half.
      setSnap((s) => (s === "full" ? "half" : "full"));
      return;
    }
    if (h < peekPx() * CLOSE_BELOW_PEEK) return close();
    // A quick flick moves one step in its direction; otherwise settle on the nearest state.
    const order: Snap[] = ["peek", "half", "full"];
    if (Math.abs(d.v) > 0.5) {
      const i = order.indexOf(nearest(d.startPx));
      setSnap(order[Math.max(0, Math.min(2, i + (d.v > 0 ? -1 : 1)))]);
      return;
    }
    setSnap(nearest(h));
  }

  function nearest(px: number): Snap {
    return (["peek", "half", "full"] as Snap[]).reduce((best, s) => (Math.abs(snapPx(s) - px) < Math.abs(snapPx(best) - px) ? s : best));
  }

  const peek = snap === "peek" && dragPx === null;
  const height =
    dragPx !== null
      ? `${dragPx}px`
      : snap === "peek"
        ? `calc(${PEEK_PX}px + env(safe-area-inset-bottom))`
        : snap === "half"
          ? `${HALF * 100}dvh`
          : `calc(100dvh - ${FULL_GAP_PX}px - env(safe-area-inset-top))`;

  return (
    <aside
      ref={aside}
      aria-label={title}
      data-snap={snap}
      style={{ "--sheet-h": height } as React.CSSProperties}
      className={`fixed inset-x-0 bottom-0 z-20 flex h-[var(--sheet-h)] flex-col rounded-t-sheet bg-paper shadow-sheet
        md:inset-x-auto md:end-0 md:top-[var(--header-h)] md:h-auto md:w-[var(--panel-w)] md:rounded-none md:shadow-panel
        ${closing ? "animate-[sheetout_.18s_ease-in_forwards] md:animate-[panelout_.18s_ease-in_forwards]" : "animate-[sheetin_.28s_var(--ease-out)] md:animate-[panelin_.28s_var(--ease-out)]"}
        ${dragPx !== null ? "" : "transition-[height] duration-[260ms] ease-[var(--ease-out)]"}`}
    >
      {/* Top bar: drag handle (phones), the place name once scrolled (always in peek), close. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative flex min-h-14 shrink-0 cursor-grab touch-none items-center gap-2 border-b ps-5 pe-3 pt-3 pb-1 transition-colors duration-150 active:cursor-grabbing md:min-h-0 md:cursor-auto md:touch-auto md:px-6 md:py-2 ${
          scrolled && !peek ? "border-line" : "border-transparent"
        }`}
      >
        {/* The handle is also a button for screen readers and keyboards: it opens and lowers the sheet. */}
        <button
          type="button"
          onClick={() => setSnap((s) => (s === "full" ? "half" : "full"))}
          aria-label={snap === "full" ? "প্যানেল ছোট করুন" : "প্যানেল বড় করুন"}
          aria-expanded={snap === "full"}
          className="absolute top-0 left-1/2 flex h-5 w-16 -translate-x-1/2 justify-center pt-1.5 md:hidden"
          tabIndex={-1}
        >
          <span className="h-1 w-9 rounded-full bg-line-strong" aria-hidden />
        </button>
        <p
          className={`min-w-0 flex-1 truncate font-semibold transition-opacity duration-150 ${peek ? "text-lead" : "text-body"} ${
            scrolled || peek ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={!(scrolled || peek)}
        >
          {title}
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="বন্ধ করুন"
          title="বন্ধ করুন (Esc)"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink active:bg-pressed md:size-10"
        >
          <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="m5 5 10 10M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 48)}
        // In peek the content is out of sight: hidden from touch and screen readers until opened.
        inert={peek}
        className={`flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] transition-opacity duration-150 md:px-6 ${
          peek ? "opacity-0 md:opacity-100" : ""
        }`}
      >
        {children}
      </div>
    </aside>
  );
}

/** A safe-area inset in px (notch, home indicator), read from CSS. */
function inset(side: "top" | "bottom"): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;top:0;height:env(safe-area-inset-${side});visibility:hidden`;
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}
const safeBottom = () => inset("bottom");
const safeTop = () => inset("top");
