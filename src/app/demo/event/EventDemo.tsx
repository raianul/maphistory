"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bnYear } from "@/lib/format";
import { loadStyle } from "@/lib/map-style";
import { THEME } from "@/lib/theme";
import { EVENTS, type DemoEvent, type Place, type Step } from "./sample";

/**
 * DEMO: historical events told on the map, over time. A slider runs through
 * the event (approximate times); each step appears when its time comes: a
 * curved arrow for a movement, a marker for something at one place. Each phase
 * has its own colour, and the map follows the step on screen. Not wired to the
 * database or the AI.
 */

/** What a GeoJSON source accepts (the type, without a direct geojson dependency). */
type GeoData = Parameters<GeoJSONSource["setData"]>[0];
type Feature = Extract<GeoData, { type: "FeatureCollection" }>["features"][number];

/** The time on the slider, as words: a clock for one night, day + part of day for several days. */
function whenBn(ev: DemoEvent, min: number): string {
  if (ev.scale === "clock") return clockBn(min);
  const day = Math.max(0, Math.floor(min / 1440));
  // A clock time only where the sources give one (the first day); later, only the stage.
  return day === 0 ? `${ev.days_bn?.[0] ?? ""} · ${clockBn(min)}` : (ev.days_bn?.[day] ?? "");
}

/** A slider tick's short label. */
function tickBn(ev: DemoEvent, min: number): string {
  if (ev.scale === "clock") return clockBn(min).split(" ")[1];
  return ev.days_bn?.[Math.floor(min / 1440)] ?? "";
}

/** "23:30" → "রাত ১১:৩০" (Bangla, 12-hour, with the part of the night). */
function clockBn(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 || 12;
  const part = h24 >= 20 || h24 < 4 ? "রাত" : h24 < 6 ? "ভোর" : h24 < 12 ? "সকাল" : h24 < 17 ? "দুপুর" : "সন্ধ্যা";
  return `${part} ${bnYear(h12)}:${bnYear(Math.floor(mm / 10))}${bnYear(mm % 10)}`;
}

/** A gentle curve from a to b (quadratic Bézier bent to one side), as [lng, lat] points. */
function arc(a: Place, b: Place, bend = 0.18, n = 48): [number, number][] {
  const mx = (a.lng + b.lng) / 2;
  const my = (a.lat + b.lat) / 2;
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [u * u * a.lng + 2 * u * t * cx + t * t * b.lng, u * u * a.lat + 2 * u * t * cy + t * t * b.lat];
  });
}

/** The room the panel takes: right column on wide screens, the bottom sheet on phones. */
function panelPadding() {
  const wide = window.matchMedia("(min-width: 768px)").matches;
  const panel = document.querySelector("aside")?.getBoundingClientRect();
  return wide
    ? { top: 60, bottom: 60, left: 60, right: (panel?.width ?? 440) + 40 }
    : { top: 40, bottom: (panel?.height ?? window.innerHeight * 0.52) + 30, left: 30, right: 30 };
}

/** Shows these steps' places in the part of the map the panel leaves free. */
function fitSteps(map: MLMap, steps: Step[], duration = 0) {
  const pts = steps.flatMap((s) => (s.from ? [s.from, s.to] : [s.to]));
  if (!pts.length) return;
  const lngs = pts.map((p) => p.lng);
  const lats = pts.map((p) => p.lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: panelPadding(), duration, maxZoom: 14 },
  );
}

/** Steps close in space to the first one (same city): the opening view. */
function openingSteps(ev: DemoEvent): Step[] {
  const first = ev.steps[0].to;
  return ev.steps.filter((s) => Math.hypot(s.to.lat - first.lat, s.to.lng - first.lng) < 0.6);
}

/** How long a movement takes to draw on the slider (minutes of story time). */
const DRAW_MIN = 25;

export function EventDemo() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [eventId, setEventId] = useState(EVENTS[EVENTS.length - 1].id);
  const EVENT = EVENTS.find((e) => e.id === eventId)!;
  const [time, setTime] = useState(EVENT.start);
  const [playing, setPlaying] = useState(false);
  const steps = EVENT.steps;
  const phase = (id: string) => EVENT.phases.find((p) => p.id === id)!;
  // How long a movement takes to draw: 25 minutes in one night, a few hours over several days.
  const drawMin = EVENT.scale === "clock" ? DRAW_MIN : Math.round((EVENT.end - EVENT.start) / 18);

  const eventIdRef = useRef(eventId);
  useEffect(() => {
    eventIdRef.current = eventId;
  });

  function pickEvent(id: string) {
    const next = EVENTS.find((e) => e.id === id)!;
    setPlaying(false);
    setEventId(id);
    setTime(next.start);
    if (mapRef.current) fitSteps(mapRef.current, openingSteps(next), 800);
  }

  // The map, once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle()]);
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({ container: container.current, style, center: [90.395, 23.762], zoom: 12.6, attributionControl: { compact: true } });
      mapRef.current = map;
      if (process.env.NODE_ENV === "development") (window as unknown as { __map: MLMap }).__map = map;
      map.on("load", () => {
        map.addSource("ev-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addSource("ev-points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // A soft white casing under each line, so it reads over streets.
        map.addLayer({
          id: "ev-lines-casing",
          type: "line",
          source: "ev-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": THEME.white, "line-width": 7, "line-opacity": ["*", 0.9, ["get", "opacity"]] },
        });
        map.addLayer({
          id: "ev-lines",
          type: "line",
          source: "ev-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3.5,
            "line-opacity": ["get", "opacity"],
            "line-dasharray": [2, 1.4],
          },
        });
        // Arrowheads: a triangle text glyph at the line's end, turned to the direction of travel.
        map.addLayer({
          id: "ev-arrows",
          type: "symbol",
          source: "ev-points",
          filter: ["==", ["get", "kind"], "arrow"],
          layout: {
            "text-field": "▶",
            "text-font": ["Noto Sans Regular"],
            "text-size": 16,
            "text-rotate": ["get", "bearing"],
            "text-rotation-alignment": "map",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: { "text-color": ["get", "color"], "text-opacity": ["get", "opacity"], "text-halo-color": THEME.white, "text-halo-width": 1.5 },
        });
        map.addLayer({
          id: "ev-pulse",
          type: "circle",
          source: "ev-points",
          filter: ["all", ["==", ["get", "kind"], "place"], ["==", ["get", "current"], true]],
          paint: { "circle-radius": 18, "circle-color": ["get", "color"], "circle-opacity": 0.15 },
        });
        map.addLayer({
          // An approximate place: a soft area, not a precise dot.
          id: "ev-approx",
          type: "circle",
          source: "ev-points",
          filter: ["all", ["==", ["get", "kind"], "place"], ["==", ["get", "approx"], true]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 14, 13, 40],
            "circle-color": ["get", "color"],
            "circle-opacity": ["*", 0.14, ["get", "opacity"]],
            "circle-stroke-color": ["get", "color"],
            "circle-stroke-width": 1.5,
            "circle-stroke-opacity": ["*", 0.5, ["get", "opacity"]],
          },
        });
        map.addLayer({
          id: "ev-places",
          type: "circle",
          source: "ev-points",
          filter: ["all", ["==", ["get", "kind"], "place"], ["!=", ["get", "approx"], true]],
          paint: {
            "circle-radius": ["case", ["get", "current"], 8, 6],
            "circle-color": ["get", "color"],
            "circle-opacity": ["get", "opacity"],
            "circle-stroke-color": THEME.white,
            "circle-stroke-width": 2.5,
            "circle-stroke-opacity": ["get", "opacity"],
          },
        });
        map.addLayer({
          id: "ev-labels",
          type: "symbol",
          source: "ev-points",
          filter: ["==", ["get", "kind"], "place"],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 13,
            "text-offset": [0, 1.3],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": THEME.ink, "text-halo-color": THEME.white, "text-halo-width": 1.6, "text-opacity": ["get", "opacity"] },
        });
        setReady(true);
        fitSteps(map, openingSteps(EVENTS.find((e) => e.id === eventIdRef.current)!));
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
    };
  }, []);

  // Which steps have happened by `time`, and which are "now".
  const shown = useMemo(() => steps.filter((s) => s.at <= time), [steps, time]);
  const currentAt = shown.length ? Math.max(...shown.map((s) => s.at)) : -1;

  // Draw: lines grow over DRAW_MIN minutes; older steps fade a little; the latest stands out.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const lines: Feature[] = [];
    const points = new Map<string, Feature>();
    for (const s of shown) {
      const { color } = phase(s.phase);
      const current = s.at === currentAt;
      const opacity = current ? 1 : 0.45;
      if (s.from) {
        const full = arc(s.from, s.to);
        const progress = Math.min(1, (time - s.at) / drawMin);
        const part = full.slice(0, Math.max(2, Math.ceil(progress * full.length)));
        lines.push({ type: "Feature", properties: { color, opacity }, geometry: { type: "LineString", coordinates: part } });
        const [a, b] = [part[part.length - 2], part[part.length - 1]];
        const bearing = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI - 90;
        points.set(`arrow-${s.title_bn}`, {
          type: "Feature",
          properties: { kind: "arrow", color, opacity, bearing },
          geometry: { type: "Point", coordinates: b },
        });
        points.set(`p-${s.from.name_bn}`, {
          type: "Feature",
          properties: { kind: "place", name: s.from.name_bn, color, opacity: opacity * 0.9, current: false },
          geometry: { type: "Point", coordinates: [s.from.lng, s.from.lat] },
        });
        if (progress < 1) continue; // the place at the end appears when the line arrives
      }
      points.set(`p-${s.to.name_bn}`, {
        type: "Feature",
        properties: { kind: "place", name: s.to.name_bn, color, opacity, current, approx: !!s.to.approx },
        geometry: { type: "Point", coordinates: [s.to.lng, s.to.lat] },
      });
    }
    (map.getSource("ev-lines") as GeoJSONSource).setData({ type: "FeatureCollection", features: lines });
    (map.getSource("ev-points") as GeoJSONSource).setData({ type: "FeatureCollection", features: [...points.values()] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase/drawMin follow the event, which `shown` already follows
  }, [ready, shown, time, currentAt]);

  // The camera follows the step on screen when it moves to another place (e.g. Chittagong → Dhaka).
  const followed = useRef<string>("");
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || currentAt < 0) return;
    const now = steps.filter((s) => s.at === currentAt);
    const key = `${eventId}@${currentAt}`;
    if (followed.current === key) return;
    followed.current = key;
    // Only move when the current step's places aren't already comfortably on screen.
    const b = map.getBounds();
    const pts = now.flatMap((s) => (s.from ? [s.from, s.to] : [s.to]));
    const visible = pts.every((p) => b.contains([p.lng, p.lat]));
    const far = pts.some((p) => Math.hypot(p.lat - map.getCenter().lat, p.lng - map.getCenter().lng) > 0.5);
    if (!visible || far) fitSteps(map, now, 1200);
  }, [ready, currentAt, steps, eventId]);

  // Play: the whole event in about 15 seconds (one night) to 25 seconds (several days).
  const span = EVENT.end - EVENT.start;
  const stepMin = EVENT.scale === "clock" ? 1 : Math.max(1, Math.round(span / 420));
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setTime((m) => {
        if (m >= EVENT.end) {
          setPlaying(false);
          return m;
        }
        return Math.min(EVENT.end, m + stepMin);
      });
    }, 60);
    return () => clearInterval(t);
  }, [playing, stepMin, EVENT.end]);

  // The list scrolls to the latest step.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector("[data-current=true]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentAt]);


  return (
    <div className="relative h-[calc(100dvh-var(--header-h)-env(safe-area-inset-top))] w-full overflow-hidden">
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full bg-[var(--map-ground)]" />
      </div>

      {/* Demo: pick an example event */}
      <div className="absolute top-3 left-3 flex gap-1 rounded-full bg-card/95 p-1 shadow-float md:top-4 md:left-4">
        {EVENTS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => pickEvent(e.id)}
            aria-pressed={e.id === eventId}
            className={`h-9 rounded-full px-3.5 text-meta transition-colors ${e.id === eventId ? "bg-accent font-semibold text-on-accent" : "text-ink-2 hover:bg-hover"}`}
          >
            {e.date_bn}
          </button>
        ))}
      </div>

      {/* Event panel */}
      <aside className="absolute inset-x-0 bottom-0 flex max-h-[52dvh] flex-col rounded-t-sheet bg-paper shadow-sheet md:inset-x-auto md:end-0 md:top-0 md:bottom-0 md:max-h-none md:w-[var(--panel-w)] md:rounded-none md:shadow-panel">
        <div className="shrink-0 px-5 pt-4 md:px-6 md:pt-6">
          <p className="text-meta font-semibold text-accent">আজকের দিনে · {EVENT.date_bn}</p>
          <h1 className="mt-1 text-display font-bold tracking-tight">{EVENT.title_bn}</h1>
          <p className="mt-2 text-body text-ink-2">{EVENT.summary_bn}</p>
          {EVENT.note_bn && (
            <p className="mt-2 rounded-control bg-warning-soft px-3 py-1.5 text-meta text-warning">
              <span className="font-semibold">ভিন্নমত আছে: </span>
              {EVENT.note_bn}
            </p>
          )}
          {/* Legend: one colour per phase */}
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {EVENT.phases.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 text-meta text-ink-2">
                <span className="h-[3px] w-5 rounded-full" style={{ background: p.color }} aria-hidden />
                {p.label_bn}
              </li>
            ))}
          </ul>

          {/* Time slider */}
          <div className="mt-4 rounded-2xl bg-card p-3 shadow-float">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (time >= EVENT.end) setTime(EVENT.start);
                  setPlaying((p) => !p);
                }}
                aria-label={playing ? "থামান" : "চালান"}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover"
              >
                {playing ? (
                  <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
                    <rect x="5" y="4" width="3.5" height="12" rx="1" />
                    <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" className="ms-0.5 size-4" fill="currentColor" aria-hidden>
                    <path d="M6 4.5v11l9-5.5z" />
                  </svg>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-lead font-bold tabular-nums">{whenBn(EVENT, time)}</span>
                  <span className="text-micro text-muted">আনুমানিক সময়</span>
                </div>
                <div className="relative mt-1.5">
                  {/* Step marks on the track, in their phase colour */}
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0" aria-hidden>
                    {steps.map((s, i) => (
                      <span
                        key={i}
                        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                        style={{ left: `${((s.at - EVENT.start) / (EVENT.end - EVENT.start)) * 100}%`, background: phase(s.phase).color }}
                      />
                    ))}
                  </div>
                  <input
                    type="range"
                    min={EVENT.start}
                    max={EVENT.end}
                    step={5}
                    value={time}
                    onChange={(e) => {
                      setPlaying(false);
                      setTime(Number(e.target.value));
                    }}
                    aria-label="সময়"
                    className="relative w-full accent-[var(--accent)]"
                  />
                </div>
                <div className="flex justify-between text-micro text-muted tabular-nums">
                  {EVENT.ticks.map((t) => (
                    <span key={t}>{tickBn(EVENT, t)}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Steps, in time order; past ones dim, the latest highlighted */}
        <ol ref={listRef} className="mt-3 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 md:px-6">
          {steps.map((s, i) => {
            const done = s.at <= time;
            const current = s.at === currentAt;
            const { color } = phase(s.phase);
            return (
              <li
                key={i}
                data-current={current}
                className={`relative border-s-2 py-2 ps-4 transition-opacity ${done ? "opacity-100" : "opacity-35"}`}
                style={{ borderColor: done ? color : "var(--line)" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    setTime(s.at + (s.from ? drawMin : 0));
                    const map = mapRef.current;
                    // Centre the place in the free part of the map (beside or above the panel).
                    if (map) map.easeTo({ center: [s.to.lng, s.to.lat], padding: panelPadding(), duration: 600 });
                  }}
                  className="w-full text-start"
                >
                  <p className="text-meta font-semibold" style={{ color }}>
                    {s.when_bn}
                    {s.evidence === "scholarly" && <span className="ms-2 rounded bg-pressed/60 px-1.5 text-micro font-normal text-ink-2">গবেষকদের ব্যাখ্যা</span>}
                    {s.evidence === "disputed" && <span className="ms-2 rounded bg-warning-soft px-1.5 text-micro font-normal text-warning">বিতর্কিত</span>}
                  </p>
                  <p className={`leading-snug ${current ? "font-semibold" : "font-medium"}`}>{s.title_bn}</p>
                  <p className="mt-0.5 text-body text-ink-2">{s.body_bn}</p>
                </button>
              </li>
            );
          })}
          <li className="mt-4 border-t border-line pt-3 text-micro text-muted">
            সূত্র:{" "}
            {EVENT.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && " · "}
                <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                  {s.title}
                </a>
              </span>
            ))}
          </li>
        </ol>
      </aside>
    </div>
  );
}
