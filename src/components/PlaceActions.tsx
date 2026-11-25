"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { siteUrl } from "@/lib/site";

type Reaction = 1 | -1 | 0;

const bnNum = (n: number) => n.toLocaleString("bn-BD");

/**
 * A place's four actions, under its title: শেয়ার · পথ দেখুন · 👍 (with the like count) · 👎.
 * Sharing opens the phone's own share sheet on touch screens, and on computers a menu of
 * Facebook, WhatsApp, X and the link to copy. Likes need the place's page (slug): a story
 * still being written gets them once it is saved.
 */
export function PlaceActions({
  title,
  path,
  slug,
  lat,
  lng,
  destination,
}: {
  title: string;
  /** The place's address on this site, e.g. "/place/lalbagh-fort". */
  path: string;
  slug?: string;
  lat: number;
  lng: number;
  /** A searchable name for directions (better than coordinates when the point is rough). */
  destination?: string;
}) {
  const url = siteUrl(path);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination ?? `${lat},${lng}`)}`;
  const button =
    "flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-meta font-semibold transition-colors disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const neutral = "bg-hover text-ink hover:bg-pressed";

  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      <Share title={title} url={url} slug={slug} className={button} neutral={neutral} />
      <a href={directions} target="_blank" rel="noreferrer" className={`${button} ${neutral}`}>
        <Icon d="m3 11 18-8-8 18-2-8z" />
        পথ দেখুন
      </a>
      <Votes slug={slug} className={button} neutral={neutral} />
    </div>
  );
}

function Icon({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const THUMB_UP = "M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z";
const THUMB_DOWN = "M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z";

/** 👍 with the like count, and 👎 (its count is for the admin only). Tapping your vote again takes it back. */
function Votes({ slug, className, neutral }: { slug?: string; className: string; neutral: string }) {
  const [state, setState] = useState<{ slug?: string; likes: number; mine: Reaction }>({ likes: 0, mine: 0 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let live = true;
    fetch(`/api/reactions/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { likes: number; mine: Reaction } | null) => live && d && setState({ slug, likes: d.likes, mine: d.mine }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  // Another place: forget the last one's numbers until its own arrive.
  const shown = state.slug === slug ? state : { likes: 0, mine: 0 as Reaction };

  async function vote(v: 1 | -1) {
    if (!slug || busy) return;
    const next: Reaction = shown.mine === v ? 0 : v;
    const before = shown;
    // Right away on screen; the server's numbers follow.
    setState({ slug, mine: next, likes: before.likes + (next === 1 ? 1 : 0) - (before.mine === 1 ? 1 : 0) });
    setBusy(true);
    track("place_reaction", { slug, value: next === 1 ? "like" : next === -1 ? "dislike" : "none" });
    try {
      const r = await fetch(`/api/reactions/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: next }) });
      const d = (await r.json()) as { likes: number; mine: Reaction };
      if (r.ok) setState({ slug, likes: d.likes, mine: d.mine });
      else setState({ ...before, slug });
    } catch {
      setState({ ...before, slug });
    } finally {
      setBusy(false);
    }
  }

  const wait = slug ? undefined : "পুরো বিবরণ এলে";
  return (
    <>
      <button
        type="button"
        disabled={!slug}
        aria-pressed={shown.mine === 1}
        aria-label={`ভালো লেগেছে${shown.likes ? `, ${bnNum(shown.likes)} জনের` : ""}`}
        title={wait}
        onClick={() => vote(1)}
        className={`${className} ${shown.mine === 1 ? "bg-accent text-on-accent hover:bg-accent-hover" : neutral}`}
      >
        <Icon d={THUMB_UP} />
        {shown.likes > 0 ? bnNum(shown.likes) : "পছন্দ"}
      </button>
      <button
        type="button"
        disabled={!slug}
        aria-pressed={shown.mine === -1}
        aria-label="ভালো লাগেনি"
        title={wait}
        onClick={() => vote(-1)}
        className={`${className} ${shown.mine === -1 ? "bg-ink text-paper hover:bg-ink-2" : neutral}`}
      >
        <Icon d={THUMB_DOWN} />
        অপছন্দ
      </button>
    </>
  );
}

/** শেয়ার: the phone's share sheet on touch screens; elsewhere our own menu. */
function Share({ title, url, slug, className, neutral }: { title: string; url: string; slug?: string; className: string; neutral: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shared = (method: string) => track("share_click", { slug, method });

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    // Escape closes the menu only (marked handled, so the panel stays open).
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  async function onShare() {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      shared("share_sheet");
      try {
        await navigator.share({ title, text: `${title} — Ondor`, url });
      } catch {
        // closed the sheet: nothing to do
      }
      return;
    }
    setOpen((o) => !o);
  }

  async function copy() {
    shared("copy_link");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("লিংকটি কপি করুন", url);
    }
  }

  const text = encodeURIComponent(`${title} — Ondor`);
  const u = encodeURIComponent(url);
  const item = "flex h-12 items-center gap-3 rounded-xl px-2.5 text-body font-semibold text-ink transition-colors hover:bg-hover";
  const badge = "grid size-8 shrink-0 place-items-center rounded-full text-white";

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={onShare} aria-expanded={open} aria-haspopup="menu" className={`${className} w-full ${open ? "bg-accent-soft text-accent" : neutral}`}>
        <Icon d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        শেয়ার
      </button>
      {open && (
        <div role="menu" aria-label="শেয়ার করুন" className="absolute start-0 top-full z-30 mt-2 w-72 animate-[fadein_.15s_ease] rounded-2xl bg-card p-2 shadow-menu">
          <p className="px-2.5 pt-1 pb-1.5 text-micro font-semibold text-muted">শেয়ার করুন</p>
          <a role="menuitem" href={`https://www.facebook.com/sharer/sharer.php?u=${u}`} target="_blank" rel="noreferrer" onClick={() => shared("facebook")} className={item}>
            <span className={`${badge} bg-[#1877f2] font-[Arial] text-lg font-bold`} aria-hidden>
              f
            </span>
            Facebook
          </a>
          <a role="menuitem" href={`https://wa.me/?text=${text}%20${u}`} target="_blank" rel="noreferrer" onClick={() => shared("whatsapp")} className={item}>
            <span className={`${badge} bg-[#1fa855]`} aria-hidden>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.3A8.5 8.5 0 1 1 21 11.5z" />
              </svg>
            </span>
            WhatsApp
          </a>
          <a role="menuitem" href={`https://x.com/intent/post?text=${text}&url=${u}`} target="_blank" rel="noreferrer" onClick={() => shared("x")} className={item}>
            <span className={`${badge} bg-[#0f1419] font-[Arial] text-sm font-bold`} aria-hidden>
              X
            </span>
            X (Twitter)
          </a>
          <div className="mx-1 mt-2 mb-1 flex items-center gap-2 rounded-xl border border-line-strong py-1 ps-3 pe-1">
            <input readOnly value={url.replace(/^https?:\/\//, "")} aria-label="লিংক" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent text-meta text-ink-2 outline-none" />
            <button type="button" role="menuitem" onClick={copy} className="h-9 shrink-0 rounded-lg bg-accent px-3 text-meta font-bold text-on-accent hover:bg-accent-hover">
              {copied ? "কপি হয়েছে ✓" : "কপি"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
