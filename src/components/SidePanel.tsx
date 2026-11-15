"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Phone sheet heights (% of the screen) it settles at after a drag. */
const SNAPS = [40, 62, 92];
/** Dragged below this, the sheet closes. */
const CLOSE_BELOW = 24;

/**
 * Place panel over the map: a 480px column on the right on wide screens, a
 * draggable bottom sheet on phones (drag the top bar between three heights,
 * or down to close). The URL is the place's own URL for curated places, so
 * closing goes back in history unless an onClose is given.
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
  const close = onClose ?? (() => router.back());
  const scroller = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(SNAPS[1]);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A new place replaces the panel content: start it from the top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [title]);

  function onPointerDown(e: React.PointerEvent) {
    // Only the phone sheet is draggable; buttons in the bar keep working.
    if (window.matchMedia("(min-width: 768px)").matches || (e.target as HTMLElement).closest("button")) return;
    drag.current = { startY: e.clientY, startHeight: height, moved: false };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    setHeight(Math.min(96, Math.max(10, d.startHeight - (dy / window.innerHeight) * 100)));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) {
      // A tap on the bar toggles between the middle and the tallest height.
      setHeight((h) => (h >= SNAPS[2] - 1 ? SNAPS[1] : SNAPS[2]));
      return;
    }
    if (height < CLOSE_BELOW) return close();
    setHeight(SNAPS.reduce((best, s) => (Math.abs(s - height) < Math.abs(best - height) ? s : best), SNAPS[0]));
  }

  return (
    <aside
      aria-label={title}
      style={{ "--sheet-h": `${height}dvh` } as React.CSSProperties}
      className={`fixed inset-x-0 bottom-0 z-20 flex h-[var(--sheet-h)] animate-[sheetin_.25s_ease-out] flex-col rounded-t-2xl border border-line bg-paper shadow-[0_-8px_30px_rgba(0,0,0,.08)]
        md:inset-x-auto md:end-0 md:top-14 md:h-auto md:w-[480px] md:animate-[panelin_.25s_ease-out] md:rounded-none md:border-y-0 md:border-e-0 md:shadow-[-8px_0_30px_rgba(0,0,0,.05)]
        ${dragging ? "" : "transition-[height] duration-200 ease-out"}`}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex shrink-0 touch-none items-center justify-center px-4 pt-2 pb-1.5 md:touch-auto md:justify-end md:py-2"
      >
        <span className="h-1 w-10 rounded-full bg-ink/15 md:hidden" aria-hidden />
        <button
          type="button"
          onClick={close}
          aria-label="বন্ধ করুন"
          className="absolute end-2 top-1 grid size-9 place-items-center rounded-full text-xl leading-none text-muted hover:bg-ink/5 hover:text-ink md:static"
        >
          ×
        </button>
      </div>
      <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </aside>
  );
}
