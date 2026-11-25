import { AMP_PATH, MARK_VIEWBOX, PIN_PATH } from "@/lib/logo";

/** The mark on its own: a pin (accent) holding an "&" (white). Sized by className. */
export function LogoMark({ className = "h-6 w-auto" }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={`${className} shrink-0`} aria-hidden>
      <path d={PIN_PATH} className="fill-accent" />
      <path d={AMP_PATH} fill="#ffffff" />
    </svg>
  );
}

/** The mark in a round badge: a white pin with an accent "&" on the accent colour. */
export function LogoBadge({ className = "size-10" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-accent ${className}`} aria-hidden>
      <svg viewBox={MARK_VIEWBOX} className="h-[62%] w-auto">
        <path d={PIN_PATH} fill="#ffffff" />
        <path d={AMP_PATH} className="fill-accent" />
      </svg>
    </span>
  );
}

/** "Place & Past" in the display face, the "&" in italic accent. Size it with a text-* class. */
export function Wordmark({ className = "text-lg" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-[-0.015em] whitespace-nowrap ${className}`}>
      Place <span className="italic text-accent">&amp;</span> Past
    </span>
  );
}
