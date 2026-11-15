"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ERA_META } from "@/lib/format";
import { searchPlaces, type GeoResult } from "@/lib/geo-search";
import type { PinPlace } from "./PlaceMap";

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

type Row = { type: "place"; place: PinPlace } | { type: "geo"; result: GeoResult };

/**
 * Search for reviewed places (first) and any place, road or river in
 * Bangladesh. Empty: shows reviewed places and recent searches.
 */
export function SearchBox({
  places,
  onPickPlace,
  onPickGeo,
  trailing,
}: {
  places: PinPlace[];
  onPickPlace: (p: PinPlace) => void;
  onPickGeo: (r: GeoResult) => void;
  /** Rendered inside the box on the right (the near-me button). */
  trailing?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [geo, setGeo] = useState<{ q: string; results: GeoResult[]; error?: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<GeoResult[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const curated = useMemo(() => {
    const lower = q.toLowerCase();
    return q ? places.filter((p) => p.name.includes(q) || p.nameEn?.toLowerCase().includes(lower)) : places;
  }, [q, places]);

  // Debounced Photon search while typing.
  useEffect(() => {
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, { signal: ctrl.signal })
        .then((results) => setGeo({ q, results }))
        .catch(() => !ctrl.signal.aborted && setGeo({ q, results: [], error: true }));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const geoRows = q.length >= 2 && geo?.q === q ? geo.results : [];
  const searching = q.length >= 2 && geo?.q !== q;
  const rows: Row[] = [
    ...curated.slice(0, 4).map((place) => ({ type: "place" as const, place })),
    ...(q ? geoRows : recent).map((result) => ({ type: "geo" as const, result })),
  ];

  function pick(row: Row) {
    if (row.type === "place") onPickPlace(row.place);
    else {
      saveRecent(row.result);
      onPickGeo(row.result);
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
      setOpen(false);
      input.current?.blur();
    }
  }

  return (
    <div className="relative">
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
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
        placeholder="যেকোনো জায়গা, রাস্তা বা নদী খুঁজুন…"
        aria-label="জায়গা খুঁজুন"
        role="combobox"
        aria-expanded={open}
        aria-controls="search-results"
        className="w-full rounded-full border border-line bg-card px-4 py-2.5 pe-28 shadow-sm outline-none focus:border-accent"
      />
      {trailing}

      {open && (
        <div
          id="search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60dvh] overflow-y-auto rounded-2xl border border-line bg-card py-1 shadow-lg"
          // Keep focus in the input while clicking a result.
          onMouseDown={(e) => e.preventDefault()}
        >
          {rows.length === 0 && !searching && (
            <p className="px-4 py-2.5 text-sm text-muted">{q ? (geo?.error ? "খোঁজা যায়নি, ইন্টারনেট সংযোগ দেখুন।" : "কিছু পাওয়া যায়নি।") : "নাম লিখে খুঁজুন"}</p>
          )}
          {rows.map((row, i) => {
            const first = i === 0 || rows[i - 1].type !== row.type;
            const heading =
              row.type === "place" ? "যাচাই করা গল্প" : q ? "সব জায়গা · AI গল্প" : "সাম্প্রতিক খোঁজ";
            return (
              <div key={row.type === "place" ? row.place.slug : `${row.result.name}-${row.result.lat}`}>
                {first && <p className="px-4 pt-2 pb-1 text-xs font-semibold text-muted">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onClick={() => pick(row)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-start ${i === active ? "bg-paper" : ""}`}
                >
                  {row.type === "place" ? (
                    <>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: ERA_META[row.place.era].hex }} />
                      <span className="font-semibold">{row.place.name}</span>
                      <span className="ms-auto shrink-0 rounded-full bg-emerald-100 px-2 text-xs text-emerald-900">✓ যাচাই করা</span>
                    </>
                  ) : (
                    <>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-paper text-xs text-muted" aria-hidden>
                        {row.result.kindBn === "সড়ক" ? "⟋" : row.result.kindBn.startsWith("নদী") || row.result.kindBn === "জলাশয়" ? "≈" : "◦"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate">{row.result.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {row.result.kindBn}
                          {row.result.context && ` · ${row.result.context}`}
                        </span>
                      </span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
          {searching && <p className="px-4 py-2 text-sm text-muted">খুঁজছি…</p>}
        </div>
      )}
    </div>
  );
}
