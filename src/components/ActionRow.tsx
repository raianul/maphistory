"use client";


import { useState } from "react";

/**
 * Share (phone share sheet, or copy the link) and directions (Google Maps)
 * for a place. Used by both the reviewed-place panel and the AI story panel.
 */
export function ActionRow({
  title,
  url,
  lat,
  lng,
  destination,
  compact,
}: {
  title: string;
  url?: string;
  lat: number;
  lng: number;
  /**
   * A searchable name, e.g. "Taj Mahal, Agra, Uttar Pradesh, India". Better than coordinates
   * when the point is only roughly right (a label clicked while zoomed out): Google finds the place.
   */
  destination?: string;
  /** Icon-only buttons, for the panel header. */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const link = url ?? (typeof window !== "undefined" ? window.location.href : "");

  async function share() {
    const full = new URL(link, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} — Ondor`, url: full });
        return;
      }
    } catch (e) {
      // The user closed the share sheet: nothing else to do.
      if ((e as Error).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("লিংকটি কপি করুন", full);
    }
  }

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination ?? `${lat},${lng}`)}`;
  const shareIcon = (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M10 3v10M6 7l4-4 4 4M4 12v4h12v-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const pinIcon = (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M10 18s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10Z" />
      <circle cx="10" cy="8" r="2" />
    </svg>
  );

  if (compact) {
    const icon = "grid size-11 place-items-center rounded-full md:size-10 text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent active:bg-accent-soft-hover";
    return (
      <div className="-me-2 flex shrink-0">
        <button type="button" onClick={share} className={icon} aria-label="শেয়ার" title={copied ? "লিংক কপি হয়েছে" : "শেয়ার"}>
          {copied ? <span className="text-meta font-semibold text-accent">✓</span> : shareIcon}
        </button>
        <a href={directions} target="_blank" rel="noreferrer" className={icon} aria-label="দিকনির্দেশ" title="দিকনির্দেশ">
          {pinIcon}
        </a>
      </div>
    );
  }
  const button =
    "flex h-10 items-center justify-center gap-1.5 rounded-full bg-accent-soft px-4 text-meta font-semibold text-accent transition-colors hover:bg-accent-soft-hover hover:text-accent-hover";

  return (
    <div className="mt-4 flex gap-2">
      <button type="button" onClick={share} className={button}>
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M10 3v10M6 7l4-4 4 4M4 12v4h12v-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {copied ? "লিংক কপি হয়েছে" : "শেয়ার"}
      </button>
      <a href={directions} target="_blank" rel="noreferrer" className={button}>
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M10 18s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10Z" />
          <circle cx="10" cy="8" r="2" />
        </svg>
        দিকনির্দেশ
      </a>
    </div>
  );
}
