"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { circle } from "@/lib/events/draw";
import { loadStyle, lockFlat } from "@/lib/map-style";
import { BANGLADESH_ONLY, BD_BOUNDS, inRegion } from "@/lib/region";
import { adminFetch } from "@/lib/supabase-browser";
import { THEME } from "@/lib/theme";

export type PickedPlace = { name: string | null; lat: number; lng: number };
type Target = "to" | "from";

const field =
  "w-full rounded-control border border-line-strong bg-card px-3 py-2 text-meta outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";

/**
 * Pick a location: search a place (OpenStreetMap, the map's region only) or click the map. For a
 * route, pick its start and its end; for an area, set the circle's radius. Typing coordinates is
 * an optional advanced action. The chosen point(s) are drawn clearly on the map.
 */
export function MapPicker({
  mode,
  to,
  from,
  radiusM,
  color,
  approximate,
  around,
  onChange,
}: {
  mode: "marker" | "route" | "area";
  /** Where to open the map when nothing is chosen yet (e.g. the event's own place). */
  around?: { lat: number; lng: number } | null;
  to: PickedPlace | null;
  from?: PickedPlace | null;
  radiusM?: number | null;
  color: string;
  approximate?: boolean;
  onChange: (v: { to?: PickedPlace | null; from?: PickedPlace | null; radiusM?: number }) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [target, setTarget] = useState<Target>(mode === "route" && !from ? "from" : "to");
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  });

  // The map, once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle()]);
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const start = to ?? from ?? around;
      const map = new maplibregl.Map({
        container: container.current,
        style,
        center: start ? [start.lng, start.lat] : [90.399, 23.716],
        zoom: start ? 13 : 6.4,
        attributionControl: { compact: true },
      });
      if (!start && BANGLADESH_ONLY) map.fitBounds(BD_BOUNDS, { padding: 20, duration: 0 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      lockFlat(map);
      mapRef.current = map;
      map.getCanvas().style.cursor = "crosshair";
      map.on("load", () => {
        const empty = { type: "FeatureCollection" as const, features: [] };
        map.addSource("pick-area", { type: "geojson", data: empty });
        map.addSource("pick-line", { type: "geojson", data: empty });
        map.addSource("pick-pts", { type: "geojson", data: empty });
        map.addLayer({ id: "pick-area-fill", type: "fill", source: "pick-area", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.14 } });
        map.addLayer({ id: "pick-area-line", type: "line", source: "pick-area", paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [3, 2] } });
        map.addLayer({ id: "pick-line", type: "line", source: "pick-line", paint: { "line-color": ["get", "color"], "line-width": 3, "line-dasharray": [2, 1.4] } });
        map.addLayer({
          id: "pick-halo",
          type: "circle",
          source: "pick-pts",
          paint: { "circle-radius": ["case", ["get", "approx"], 26, 16], "circle-color": ["get", "color"], "circle-opacity": 0.18 },
        });
        map.addLayer({
          id: "pick-pts",
          type: "circle",
          source: "pick-pts",
          paint: { "circle-radius": 8, "circle-color": ["get", "color"], "circle-stroke-color": THEME.white, "circle-stroke-width": 3 },
        });
        map.addLayer({
          id: "pick-labels",
          type: "symbol",
          source: "pick-pts",
          layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.5], "text-anchor": "top" },
          paint: { "text-color": THEME.ink, "text-halo-color": THEME.white, "text-halo-width": 1.6 },
        });
        setReady(true);
      });
      // A click sets the active point; the name is the nearest labelled place, if any.
      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        const f = map.queryRenderedFeatures(
          [
            [e.point.x - 12, e.point.y - 12],
            [e.point.x + 12, e.point.y + 12],
          ],
        ).find((x) => x.layer.type === "symbol" && (x.properties?.["name:bn"] || x.properties?.name));
        const name = (f?.properties?.["name:bn"] ?? f?.properties?.name ?? null) as string | null;
        const p = { name, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
        changeRef.current(targetRef.current === "from" ? { from: p } : { to: p });
        if (targetRef.current === "from") setTarget("to");
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; later changes are drawn below
  }, []);

  // Draw the current choice.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    type GeoData = Parameters<GeoJSONSource["setData"]>[0];
    const pts: GeoData = {
      type: "FeatureCollection",
      features: [
        ...(mode === "route" && from ? [{ type: "Feature" as const, properties: { color, label: `শুরু: ${from.name ?? ""}`, approx: !!approximate }, geometry: { type: "Point" as const, coordinates: [from.lng, from.lat] } }] : []),
        ...(to ? [{ type: "Feature" as const, properties: { color, label: `${mode === "route" ? "গন্তব্য: " : ""}${to.name ?? ""}`, approx: !!approximate }, geometry: { type: "Point" as const, coordinates: [to.lng, to.lat] } }] : []),
      ],
    };
    (map.getSource("pick-pts") as GeoJSONSource).setData(pts);
    (map.getSource("pick-line") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: mode === "route" && from && to ? [{ type: "Feature", properties: { color }, geometry: { type: "LineString", coordinates: [[from.lng, from.lat], [to.lng, to.lat]] } }] : [],
    });
    (map.getSource("pick-area") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: mode === "area" && to && radiusM ? [{ type: "Feature", properties: { color }, geometry: { type: "Polygon", coordinates: [circle(to, radiusM)] } }] : [],
    });
  }, [ready, mode, to, from, radiusM, color, approximate]);

  function flyTo(p: PickedPlace) {
    mapRef.current?.easeTo({ center: [p.lng, p.lat], zoom: Math.max(mapRef.current.getZoom(), 14), duration: 600 });
  }

  const outside = [to, from].some((p) => p && !inRegion(p.lat, p.lng));

  return (
    <div className="grid gap-2">
      {mode === "route" && (
        <div className="flex gap-1 rounded-full bg-hover p-1 text-meta" role="radiogroup" aria-label="কোন স্থান বেছে নিচ্ছেন">
          {(["from", "to"] as Target[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={target === t}
              onClick={() => setTarget(t)}
              className={`h-8 flex-1 rounded-full px-3 transition-colors ${target === t ? "bg-card font-semibold text-accent shadow-float" : "text-ink-2"}`}
            >
              {t === "from" ? `১. শুরু${from ? " ✓" : ""}` : `২. গন্তব্য${to ? " ✓" : ""}`}
            </button>
          ))}
        </div>
      )}
      <PlaceSearch
        placeholder={mode === "route" ? (target === "from" ? "শুরুর স্থান খুঁজুন…" : "গন্তব্য খুঁজুন…") : "স্থান খুঁজুন…"}
        onPick={(p) => {
          changeRef.current(target === "from" ? { from: p } : { to: p });
          flyTo(p);
          if (target === "from") setTarget("to");
        }}
      />
      <div className="relative h-72 overflow-hidden rounded-control border border-line">
        {/* MapLibre's CSS forces position: relative on the map element, so a wrapper does the positioning. */}
        <div className="absolute inset-0">
          <div ref={container} className="h-full w-full bg-[var(--map-ground)]" aria-label="মানচিত্রে ক্লিক করে স্থান বেছে নিন" />
        </div>
        <p className="pointer-events-none absolute start-2 top-2 rounded-full bg-card/95 px-2.5 py-1 text-micro text-ink-2 shadow-float">
          {mode === "route" ? (target === "from" ? "মানচিত্রে ক্লিক করুন: শুরুর স্থান" : "মানচিত্রে ক্লিক করুন: গন্তব্য") : "মানচিত্রে ক্লিক করে স্থান বেছে নিন"}
        </p>
      </div>
      {mode === "area" && (
        <label className="grid gap-1 text-meta font-semibold text-ink-2">
          এলাকার ব্যাসার্ধ: {formatRadius(radiusM ?? 500)}
          <input
            type="range"
            min={100}
            max={20000}
            step={100}
            value={radiusM ?? 500}
            onChange={(e) => changeRef.current({ radiusM: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
        </label>
      )}
      <Chosen mode={mode} to={to} from={from} />
      {outside && <p className="text-meta text-warning">এই স্থান বর্তমান মানচিত্রের এলাকার (বাংলাদেশ) বাইরে; প্রকাশ করা যাবে না।</p>}
      <ManualCoords mode={mode} to={to} from={from} onChange={(v) => changeRef.current(v)} />
    </div>
  );
}

function formatRadius(m: number) {
  const n = (x: number) => x.toLocaleString("bn-BD", { maximumFractionDigits: 1 });
  return m >= 1000 ? `${n(m / 1000)} কিমি` : `${n(m)} মিটার`;
}

function Chosen({ mode, to, from }: { mode: string; to: PickedPlace | null; from?: PickedPlace | null }) {
  const line = (label: string, p: PickedPlace | null | undefined) => (
    <p className="text-meta">
      <span className="text-muted">{label}: </span>
      {p ? (
        <>
          <span className="font-semibold">{p.name || "মানচিত্রের বিন্দু"}</span>
          <span className="text-muted tabular-nums">
            {" "}
            ({p.lat.toFixed(5)}, {p.lng.toFixed(5)})
          </span>
        </>
      ) : (
        <span className="text-warning">এখনো বেছে নেওয়া হয়নি</span>
      )}
    </p>
  );
  return (
    <div className="rounded-control bg-paper px-3 py-2">
      {mode === "route" && line("শুরু", from)}
      {line(mode === "route" ? "গন্তব্য" : mode === "area" ? "কেন্দ্র" : "স্থান", to)}
    </div>
  );
}

/** Advanced: type coordinates by hand (folded away by default). */
function ManualCoords({
  mode,
  to,
  from,
  onChange,
}: {
  mode: string;
  to: PickedPlace | null;
  from?: PickedPlace | null;
  onChange: (v: { to?: PickedPlace; from?: PickedPlace }) => void;
}) {
  const pair = (label: string, p: PickedPlace | null | undefined, key: "to" | "from") => (
    <div className="grid grid-cols-2 gap-2">
      {(["lat", "lng"] as const).map((k) => (
        <label key={k} className="grid gap-1 text-micro text-muted">
          {label} · {k === "lat" ? "অক্ষাংশ" : "দ্রাঘিমাংশ"}
          <input
            // Keyed by the current value: picking on the map (or searching) refreshes the field, so
            // it never shows stale numbers next to a different pin.
            key={`${key}-${k}-${p?.[k] ?? ""}`}
            type="number"
            step="any"
            defaultValue={p?.[k] ?? ""}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (e.target.value.trim() === "" || !Number.isFinite(v)) return;
              const base = p ?? { name: null, lat: 0, lng: 0 };
              onChange({ [key]: { ...base, [k]: v } });
            }}
            className={field}
          />
        </label>
      ))}
    </div>
  );
  return (
    <details className="text-meta">
      <summary className="cursor-pointer text-muted select-none hover:text-ink">উন্নত: স্থানাঙ্ক হাতে লিখুন</summary>
      <div className="mt-2 grid gap-2">
        {mode === "route" && pair("শুরু", from, "from")}
        {pair(mode === "route" ? "গন্তব্য" : "স্থান", to, "to")}
        <p className="text-micro text-muted">শুধু নির্ভরযোগ্য সূত্রে স্থানাঙ্ক থাকলে লিখুন; অনুমান করবেন না।</p>
      </div>
    </details>
  );
}

/** Place search through the admin geocode route (OpenStreetMap, region only). */
export function PlaceSearch({ placeholder, onPick }: { placeholder: string; onPick: (p: PickedPlace) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ name: string; context: string; lat: number; lng: number }[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "empty" | "error">("idle");

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState("searching");
      const r = await adminFetch(`/api/admin/geocode?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal }).catch(() => null);
      if (!r) return;
      const d = await r.json().catch(() => ({ results: [] }));
      setResults(d.results ?? []);
      setState(!r.ok ? "error" : d.results?.length ? "idle" : "empty");
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className={field} aria-label={placeholder} />
      {q.trim().length >= 2 && (results.length > 0 || state !== "idle") && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-control bg-card p-1 shadow-menu">
          {state === "searching" && <li className="px-3 py-2 text-meta text-muted">খুঁজছি…</li>}
          {state === "empty" && <li className="px-3 py-2 text-meta text-muted">কিছু পাওয়া যায়নি</li>}
          {state === "error" && <li className="px-3 py-2 text-meta text-danger">খোঁজা যায়নি</li>}
          {results.map((r) => (
            <li key={`${r.name}-${r.lat}-${r.lng}`}>
              <button
                type="button"
                onClick={() => {
                  onPick({ name: r.name, lat: r.lat, lng: r.lng });
                  setQ("");
                  setResults([]);
                }}
                className="w-full rounded-lg px-3 py-1.5 text-start hover:bg-accent-soft"
              >
                <span className="block text-meta font-semibold">{r.name}</span>
                <span className="block text-micro text-muted">{r.context}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
