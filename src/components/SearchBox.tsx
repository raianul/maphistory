"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, type GeoResult } from "@/lib/geo-search";

const RECENT_KEY = "jg-recent-searches";

function loadRecent(): GeoResult[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as GeoResult[];
  } catch {
    return [];
  }
}

function saveRecent(r: GeoResult) {
  try {
    const next = [r, ...loadRecent().filter((x) => !(x.name === r.name && x.lat === r.lat))].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // private mode or storage blocked: recent searches are just a convenience
  }
}

/** A place or event on this site (from /api/search). */
export type SiteHit =
  | { type: "place"; slug: string; name: string; line: string; lat: number; lng: number }
  | { type: "event"; slug: string; name: string; line: string };

type Row = { site: SiteHit } | { geo: GeoResult };

/**
 * Search: the site's own places and events first (they open), then any area, road or river on the
 * map (Photon), which only moves the map there. Empty: shows recent map searches.
 */
export function SearchBox({
  onPickGeo,
  onPickSite,
  onOpen,
  leading,
  trailing,
}: {
  /** A general map result: the map moves there (no story). */
  onPickGeo: (r: GeoResult) => void;
  /** One of the site's places or events: it opens. */
  onPickSite: (hit: SiteHit) => void;
  /** Called when the results list opens (the map makes room for it). */
  onOpen?: () => void;
  /** Rendered inside the box at the start instead of the search icon (the brand mark on phones). */
  leading?: React.ReactNode;
  /** Rendered inside the box at the end (the near-me button). */
  trailing?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<{ q: string; results: GeoResult[]; error?: boolean } | null>(null);
  const [site, setSite] = useState<{ q: string; hits: SiteHit[] } | null>(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<GeoResult[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const q = query.trim();

  // Debounced Photon search while typing.
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, { signal: ctrl.signal })
        .then((results) => setGeo({ q, results }))
        .catch(() => !ctrl.signal.aborted && setGeo({ q, results: [], error: true }));
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d: { hits: SiteHit[] }) => setSite({ q, hits: d.hits ?? [] }))
        .catch(() => !ctrl.signal.aborted && setSite({ q, hits: [] }));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const geoRows = q.length >= 2 && geo?.q === q ? geo.results : [];
  const siteRows = q.length >= 2 && site?.q === q ? site.hits : [];
  const searching = q.length >= 2 && (geo?.q !== q || site?.q !== q);
  const rows: Row[] = q ? [...siteRows.map((s) => ({ site: s })), ...geoRows.map((g) => ({ geo: g }))] : recent.map((g) => ({ geo: g }));

  function pick(row: Row) {
    if ("site" in row) onPickSite(row.site);
    else {
      saveRecent(row.geo);
      onPickGeo(row.geo);
    }
    setQuery("");
    setOpen(false);
    input.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      pick(rows[active]);
    } else if (e.key === "Escape") {
      // Handled here: the story panel behind the search stays open.
      e.preventDefault();
      setOpen(false);
      input.current?.blur();
    }
  }

  const kindIcon = (kind: string) =>
    kind === "সড়ক" ? ROAD : kind.startsWith("নদী") || kind === "জলাশয়" ? WATER : PIN;

  return (
    <div className="relative">
      <div
        className={`flex h-[52px] items-center gap-0.5 rounded-full bg-card pe-1 shadow-float transition-shadow md:gap-1 ${leading ? "ps-1.5" : "ps-4"} ${
          open ? "shadow-menu ring-2 ring-accent-ring" : ""
        }`}
      >
        {leading ?? (
          <svg viewBox="0 0 20 20" className="size-[18px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.8 3.8" strokeLinecap="round" />
          </svg>
        )}
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(loadRecent());
            setOpen(true);
            onOpen?.();
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
          placeholder="জায়গা, ঘটনা বা এলাকা খুঁজুন"
          aria-label="জায়গা খুঁজুন"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          aria-autocomplete="list"
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-[16px] caret-accent outline-none placeholder:text-muted focus-visible:outline-none"
        />
        {searching ? (
          <span className="grid size-11 shrink-0 place-items-center md:size-10" aria-hidden>
            <span className="size-4 animate-spin rounded-full border-2 border-accent-soft-hover border-t-accent" />
          </span>
        ) : query ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              setActive(0);
              input.current?.focus();
            }}
            aria-label="মুছুন"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-hover hover:text-ink active:bg-pressed md:size-10"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
        {trailing && <span className="h-5 w-px shrink-0 bg-line" aria-hidden />}
        {trailing}
      </div>

      {open && (
        <div
          id="search-results"
          role="listbox"
          aria-label="খোঁজের ফল"
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-[min(calc(100dvh-10rem),28rem)] animate-[rise_.15s_var(--ease-out)] overflow-y-auto overscroll-contain rounded-2xl bg-card p-1.5 shadow-menu"
          // Keep focus in the input while clicking a result.
          onMouseDown={(e) => e.preventDefault()}
        >
          {rows.length === 0 && !searching && (
            <p className="px-3 py-3 text-meta text-muted">
              {!q
                ? "কোনো জায়গা, ঘটনা বা এলাকার নাম লিখুন।"
                : q.length < 2
                  ? "আরেকটু লিখুন…"
                  : geo?.error
                    ? "খোঁজা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"
                    : `"${q}" নামে কিছু পাওয়া যায়নি। অন্য বানানে চেষ্টা করুন।`}
            </p>
          )}
          {rows.length > 0 && !q && <p className="px-3 pt-2 pb-1 text-micro font-semibold tracking-wide text-muted">সাম্প্রতিক খোঁজ</p>}
          {rows.map((row, i) => {
            const isSite = "site" in row;
            const firstGeo = !isSite && i > 0 && "site" in rows[i - 1];
            const name = isSite ? row.site.name : row.geo.name;
            const meta = isSite ? row.site.line : [row.geo.kindBn, row.geo.context].filter(Boolean).join(" · ");
            const glyph = isSite ? (row.site.type === "event" ? EVENT : SITE_PIN) : q ? kindIcon(row.geo.kindBn) : CLOCK;
            return (
              <div key={isSite ? `s-${row.site.type}-${row.site.slug}` : `g-${row.geo.name}-${row.geo.lat}`}>
                {i === 0 && isSite && <p className="px-3 pt-2 pb-1 text-micro font-semibold tracking-wide text-muted">এই সাইটে</p>}
                {firstGeo && <p className="px-3 pt-3 pb-1 text-micro font-semibold tracking-wide text-muted">মানচিত্রে যান</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onClick={() => pick(row)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-1.5 text-start transition-colors ${
                    i === active ? "bg-accent-soft" : ""
                  }`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full ${isSite ? "bg-accent text-on-accent" : i === active ? "bg-card text-accent" : "bg-pressed/60 text-muted"}`}
                    aria-hidden
                  >
                    {glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${isSite ? "font-semibold" : ""}`}>{name}</span>
                    {meta && <span className="block truncate text-meta text-muted">{meta}</span>}
                  </span>
                </button>
              </div>
            );
          })}
          {searching && rows.length > 0 && <p className="px-3 py-2 text-meta text-muted">আরও খুঁজছি…</p>}
        </div>
      )}
    </div>
  );
}

const icon = (d: React.ReactNode) => (
  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
    {d}
  </svg>
);
const PIN = icon(
  <>
    <path d="M10 17.5s5.5-5 5.5-9.25a5.5 5.5 0 1 0-11 0C4.5 12.5 10 17.5 10 17.5Z" />
    <circle cx="10" cy="8.25" r="1.75" />
  </>,
);
const ROAD = icon(<path d="M7 3 4 17M13 3l3 14M10 4v2M10 9v2M10 14v2" strokeLinecap="round" />);
const WATER = icon(<path d="M3 8c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0M3 13c2.3-1.6 4.7-1.6 7 0s4.7 1.6 7 0" strokeLinecap="round" />);
const SITE_PIN = icon(<path d="M10 17.5s5.5-5 5.5-9.25a5.5 5.5 0 1 0-11 0C4.5 12.5 10 17.5 10 17.5Z" fill="currentColor" stroke="none" />);
const EVENT = icon(
  <>
    <rect x="3.5" y="4.5" width="13" height="12" rx="2" />
    <path d="M3.5 8.5h13M7 3v3M13 3v3" strokeLinecap="round" />
  </>,
);
const CLOCK = icon(
  <>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M10 6.5V10l2.5 1.5" strokeLinecap="round" />
  </>,
);
