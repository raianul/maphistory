"use client";

import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStyle, MIN_ZOOM, lockFlat } from "@/lib/map-style";
import { adminFetch } from "@/lib/supabase-browser";
import { THEME } from "@/lib/theme";
import { PlaceDetail, type PlaceStatus } from "./PlaceDetail";

type Row = {
  id: string;
  name_bn: string;
  name_en: string | null;
  lat: number;
  lng: number;
  kind: string | null;
  status: PlaceStatus;
  views: number;
  reports: number;
  /** Visitors' 👍 and 👎 (the public sees only the likes). */
  likes: number;
  dislikes: number;
  created_at: string;
  updated_at: string;
  /** The map chip it falls under (Bangla), if any. */
  category_label: string | null;
  /** Has a pin on the public map (undefined before the show_on_map migration). */
  show_on_map?: boolean;
};

/** Pin and dot colours: blue = on the public map; grey = AI only, off it; gold = verified, off it. */
const ON_MAP = "#2563eb";
const OFF: Record<PlaceStatus, string> = { ai: "#8a8178", verified: "#b8860b", hidden: "#cfc6b8" };
const REPORTED = "#c0392b";
const pinColor = (r: Pick<Row, "status" | "show_on_map">) => (r.show_on_map && r.status !== "hidden" ? ON_MAP : OFF[r.status]);

type Filter = "all" | "ai" | "verified" | "on_map" | "reported" | "hidden";
type Sort = "views" | "recent" | "new" | "disliked";

const FILTERS: { id: Filter; label: string; tone?: string; test: (r: Row) => boolean }[] = [
  { id: "all", label: "All", test: (r) => r.status !== "hidden" },
  { id: "ai", label: "To check", tone: "text-warning", test: (r) => r.status === "ai" },
  { id: "verified", label: "Verified", tone: "text-success", test: (r) => r.status === "verified" },
  { id: "on_map", label: "On map", test: (r) => !!r.show_on_map && r.status !== "hidden" },
  { id: "reported", label: "Reported", tone: "text-danger", test: (r) => r.reports > 0 },
  { id: "hidden", label: "Hidden", tone: "text-muted", test: (r) => r.status === "hidden" },
];

const SORTS: Record<Sort, { label: string; by: (a: Row, b: Row) => number }> = {
  views: { label: "Most opened", by: (a, b) => b.views - a.views },
  recent: { label: "Recently changed", by: (a, b) => b.updated_at.localeCompare(a.updated_at) },
  new: { label: "Newest", by: (a, b) => b.created_at.localeCompare(a.created_at) },
  disliked: { label: "Most disliked", by: (a, b) => b.dislikes - b.likes - (a.dislikes - a.likes) || b.dislikes - a.dislikes },
};

/** A value from the page's address (the admin renders in the browser only, after login). */
const param = (key: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(key));

/**
 * /admin/places: every saved place. A list on the left (filters, search, sort) and, beside it,
 * the chosen place (List) or every pin (Map). Phones show one at a time: list, then the place.
 * Home links here with ?filter=reported, ?sort=views, ?q=… or ?id=<place>.
 */
export function AdminMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">(() => (param("view") === "map" ? "map" : "list"));
  const [filter, setFilter] = useState<Filter>(() => {
    const f = param("filter");
    return FILTERS.some((x) => x.id === f) ? (f as Filter) : "all";
  });
  const [sort, setSort] = useState<Sort>(() => {
    const s = param("sort");
    return s && s in SORTS ? (s as Sort) : "views";
  });
  const [query, setQuery] = useState(() => param("q") ?? "");
  const [selected, setSelected] = useState<string | null>(() => param("id"));

  // Refetched after every change in the place view.
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    adminFetch("/api/admin/stories").then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (r.ok) setRows(data.stories);
      else setError(data.error ?? `HTTP ${r.status}`);
      setLoaded(true);
    });
  }, [version]);

  // The address follows what's open, so a reload or a shared link comes back to it.
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [k, v] of [
      ["id", selected],
      ["filter", filter === "all" ? null : filter],
      ["sort", sort === "views" ? null : sort],
      ["view", view === "map" ? "map" : null],
    ] as const) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    url.searchParams.delete("q");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [selected, filter, sort, view]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(f.test).length])) as Record<Filter, number>, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return rows
      .filter(test)
      .filter((r) => !q || r.name_bn.includes(q) || r.name_en?.toLowerCase().includes(q))
      .sort(SORTS[sort].by);
  }, [rows, filter, sort, query]);

  // The map, created once (it waits out of sight while the list view is on).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle("en")]); // English interface: English place names
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: container.current,
        style,
        center: [90.399, 23.716],
        zoom: 12,
        minZoom: MIN_ZOOM,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      lockFlat(map);
      mapRef.current = map;
      map.on("load", () => {
        map.addSource("stories", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "story-pins",
          type: "circle",
          source: "stories",
          paint: {
            "circle-color": ["get", "color"],
            // Bigger = opened more often.
            "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "views"]], 0, 6, 5, 11, 15, 18],
            "circle-stroke-color": ["case", [">", ["get", "reports"], 0], REPORTED, THEME.white],
            "circle-stroke-width": ["case", [">", ["get", "reports"], 0], 3.5, 2],
            "circle-opacity": ["case", ["==", ["get", "status"], "hidden"], 0.6, 1],
          },
        });
        map.addLayer({
          id: "story-selected",
          type: "circle",
          source: "stories",
          filter: ["==", ["get", "id"], ""],
          paint: { "circle-radius": 22, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": THEME.accent, "circle-stroke-width": 3 },
        });
        map.addLayer({
          id: "story-labels",
          type: "symbol",
          source: "stories",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 13,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": THEME.ink, "text-halo-color": THEME.white, "text-halo-width": 1.5 },
        });
        map.on("click", "story-pins", (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) setSelected(id);
        });
        map.on("mouseenter", "story-pins", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "story-pins", () => (map.getCanvas().style.cursor = ""));
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Pins follow the filters and search.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("stories") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: shown.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: { id: r.id, name: r.name_bn, status: r.status, views: r.views, reports: r.reports, color: pinColor(r) },
      })),
    });
  }, [ready, shown]);

  useEffect(() => {
    if (ready) mapRef.current?.setFilter("story-selected", ["==", ["get", "id"], selected ?? ""]);
  }, [ready, selected]);

  // The map was out of sight (or another size): fit it to its box again, and show the chosen place.
  const chosen = selected ? rows.find((x) => x.id === selected) : undefined;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || view !== "map") return;
    map.resize();
    if (chosen) map.easeTo({ center: [chosen.lng, chosen.lat], zoom: Math.max(map.getZoom(), 14), padding: { right: window.innerWidth >= 1024 ? 560 : 0, left: 0, top: 0, bottom: 0 } });
  }, [ready, view, chosen]);

  const mapView = view === "map";

  return (
    <div className="flex h-[calc(100dvh-var(--header-h)-var(--admin-tabbar))]">
      {/* The list (hidden in Map view; phones: also while a place is open) */}
      <aside className={`${mapView ? "hidden" : selected ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-e border-line bg-paper md:w-[380px]`}>
        <div className="flex flex-col gap-3 px-4 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 text-display font-bold tracking-tight">Places</h1>
            <ViewSwitch view={view} onChange={setView} />
          </div>
          <label className="flex h-[42px] items-center gap-2 rounded-full border border-line-strong bg-card px-3.5 focus-within:border-accent">
            <svg viewBox="0 0 24 24" className="size-[17px] shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder="Search places…" aria-label="Search places" className="min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.id)}
                  className={`h-8 rounded-full px-3 text-meta font-semibold transition-colors ${on ? "bg-ink text-paper" : `border border-line-strong bg-card hover:bg-hover ${f.tone ?? "text-ink-2"}`}`}
                >
                  {f.label} {counts[f.id]}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-1.5 text-meta text-muted">
            Sort:
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent font-semibold text-ink outline-none">
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORTS[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="px-4 pb-2 text-meta text-danger">{error}</p>}
        <ul className="flex-1 overflow-y-auto px-2 pb-4">
          {shown.map((r) => (
            <li key={r.id}>
              <PlaceRow r={r} on={selected === r.id} onPick={() => setSelected(r.id)} />
            </li>
          ))}
          {loaded && rows.length === 0 && !error && <li className="p-3 text-meta text-muted">No places yet. Click any name on the public map and its story shows up here.</li>}
          {loaded && rows.length > 0 && shown.length === 0 && <li className="p-3 text-meta text-muted">Nothing matches.</li>}
        </ul>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5 text-micro text-muted">
          <span className="flex items-center gap-1.5">
            <Dot c={ON_MAP} /> On the public map
          </span>
          <span className="flex items-center gap-1.5">
            <Dot c={OFF.ai} /> Off the map
          </span>
          <span className="flex items-center gap-1.5">
            <Dot c={OFF.verified} /> Verified, off the map
          </span>
        </p>
      </aside>

      {/* Beside the list: the chosen place, or the map */}
      <section className={`${selected || mapView ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 bg-card`}>
        <div className={`absolute inset-0 ${mapView ? "" : "invisible"}`} aria-hidden={!mapView}>
          <div ref={container} className="h-full w-full bg-[var(--map-ground)]" aria-label="Map of saved places" />
          {/* Back to the list (under the place on narrower screens, where the place covers the map) */}
          {mapView && (
            <div className={`absolute start-3 top-3 ${selected ? "hidden lg:block" : ""}`}>
              <ViewSwitch view={view} onChange={setView} floating />
            </div>
          )}
        </div>
        {selected ? (
          <div className={`relative z-10 w-full overflow-y-auto bg-card ${mapView ? "lg:ms-auto lg:w-[560px] lg:border-s lg:border-line lg:shadow-[-12px_0_32px_rgb(16_24_40/0.08)]" : ""}`}>
            {mapView && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="absolute end-3 top-3 z-10 hidden size-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink md:grid"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
            <PlaceDetail key={selected} id={selected} onClose={() => setSelected(null)} onChanged={load} />
          </div>
        ) : (
          !mapView && (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div className="max-w-xs">
                <p className="text-lead font-semibold">Pick a place from the list</p>
                <p className="mt-1 text-meta text-muted">Or switch to Map to find it by where it is.</p>
              </div>
            </div>
          )
        )}
      </section>
    </div>
  );
}

function ViewSwitch({ view, onChange, floating = false }: { view: "list" | "map"; onChange: (v: "list" | "map") => void; floating?: boolean }) {
  const cls = (on: boolean) => `h-8 rounded-full px-3.5 text-meta transition-colors ${on ? "bg-card font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`;
  return (
    <div role="group" aria-label="View" className={`flex rounded-full p-[3px] ${floating ? "bg-card shadow-float [&_[aria-pressed=true]]:bg-accent-soft [&_[aria-pressed=true]]:text-accent" : "bg-pressed"}`}>
      <button type="button" aria-pressed={view === "list"} onClick={() => onChange("list")} className={cls(view === "list")}>
        List
      </button>
      <button type="button" aria-pressed={view === "map"} onClick={() => onChange("map")} className={cls(view === "map")}>
        Map
      </button>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block size-2.5 rounded-full" style={{ background: c }} aria-hidden />;
}

/** One place in the list: name, what it is, and the one thing to know about it. */
function PlaceRow({ r, on, onPick }: { r: Row; on: boolean; onPick: () => void }) {
  const flag =
    r.reports > 0
      ? { text: `${r.reports} ${r.reports === 1 ? "report" : "reports"}`, cls: "text-danger" }
      : r.status === "hidden"
        ? { text: "Hidden", cls: "text-muted" }
        : r.dislikes >= 3 && r.dislikes > r.likes
          ? { text: "Disliked", cls: "text-warning" }
          : r.status === "verified"
            ? { text: "✓ Verified", cls: "text-success" }
            : { text: "To check", cls: "text-warning" };
  const meta = [r.category_label, r.show_on_map && r.status !== "hidden" ? "on map" : "not on map"].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={on ? "true" : undefined}
      className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-start transition-colors ${on ? "bg-card shadow-[0_1px_2px_rgb(16_24_40/0.06),0_0_0_2px_var(--accent)]" : "hover:bg-hover"}`}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: pinColor(r) }} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{r.name_bn}</span>
        <span className="truncate text-meta text-muted">{meta}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-micro">
        <span className="text-muted">{r.views.toLocaleString("en-GB")} opens</span>
        <span className={`font-semibold ${flag.cls}`}>{flag.text}</span>
      </span>
    </button>
  );
}
