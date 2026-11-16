"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { addEventLayers, drawSteps, drawsOnMap, stepBounds, stepColor } from "@/lib/events/draw";
import { EVIDENCE_EN, LOCATION_PRECISION_EN, PHASE_PALETTE, type HistoricalEvent, type TimelineStep } from "@/lib/events/schema";
import { loadStyle, lockFlat } from "@/lib/map-style";
import { THEME } from "@/lib/theme";

/**
 * The timeline as visitors will see it: a map and a step card side by side, previous/next and a
 * step slider. Each step updates the markers, routes, circles, colours and text, and moves the map
 * to it, except for unknown locations, which never move the map.
 */
export function TimelinePreview({ event, steps }: { event: HistoricalEvent; steps: TimelineStep[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const i = Math.min(index, Math.max(0, steps.length - 1));
  const phases = useMemo(() => event.phases ?? [], [event.phases]);
  const s = steps[i];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle("en")]); // English interface: English place names
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const start = event.lat !== null && event.lat !== undefined ? ([event.lng!, event.lat] as [number, number]) : ([90.399, 23.716] as [number, number]);
      const map = new maplibregl.Map({ container: container.current, style, center: start, zoom: 12, attributionControl: { compact: true } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      lockFlat(map);
      mapRef.current = map;
      map.on("load", () => {
        addEventLayers(map, THEME.white, THEME.ink);
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the event's place only sets the first view
  }, []);

  // Draw up to the current step, and frame it (unknown places: the map stays where it is).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    drawSteps(map, steps, phases, i);
    const b = s && stepBounds(s);
    if (b) map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 700 });
  }, [ready, steps, phases, i, s]);

  if (!steps.length) return <p className="text-meta text-muted">Add steps to see the timeline here.</p>;

  const color = stepColor(phases, s.phase_id);
  const phase = phases.find((p) => p.id === s.phase_id);

  return (
    <div className="grid overflow-hidden rounded-control border border-line md:grid-cols-[1fr_320px]">
      <div className="relative h-80 md:h-[420px]">
        {/* MapLibre's CSS forces position: relative on the map element, so a wrapper does the positioning. */}
        <div className="absolute inset-0">
          <div ref={container} className="h-full w-full bg-[var(--map-ground)]" aria-label="Preview map" />
        </div>
        {!drawsOnMap(s) && (
          <p className="absolute start-2 bottom-8 rounded-full bg-card/95 px-2.5 py-1 text-micro text-ink-2 shadow-float">
            {s.map_type === "none" ? "This step shows nothing on the map" : "Location unknown: the map stays put"}
          </p>
        )}
      </div>
      <div className="flex flex-col bg-paper p-4">
        {phases.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {phases.map((p) => (
              <li key={p.id} className="flex items-center gap-1.5 text-micro text-ink-2">
                <span className="h-[3px] w-4 rounded-full" style={{ background: PHASE_PALETTE[p.color].hex }} aria-hidden />
                {p.label}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex-1" aria-live="polite">
          <p className="text-micro font-semibold" style={{ color }}>
            Step {i + 1} of {steps.length}
            {phase && ` · ${phase.label}`}
            {s.date_label && ` · ${s.date_label}`}
          </p>
          <h3 className="mt-1 text-lead font-bold leading-snug">{s.title}</h3>
          {s.narrative && <p className="mt-1.5 text-body text-ink-2">{s.narrative}</p>}
          <p className="mt-2 flex flex-wrap gap-1 text-micro">
            {s.place_name && <span className="rounded-full bg-hover px-2 py-0.5 text-ink-2">{s.map_type === "route" && s.from_place_name ? `${s.from_place_name} → ${s.place_name}` : s.place_name}</span>}
            {s.location_precision !== "exact" && <span className="rounded-full bg-hover px-2 py-0.5 text-ink-2">Location: {LOCATION_PRECISION_EN[s.location_precision].toLowerCase()}</span>}
            {s.evidence !== "documented" && (
              <span className={`rounded-full px-2 py-0.5 ${s.evidence === "disputed" ? "bg-warning-soft text-warning" : "bg-hover text-ink-2"}`}>{EVIDENCE_EN[s.evidence]}</span>
            )}
            {!s.verified && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-warning">Not verified</span>}
          </p>
          {s.image && (
            <figure className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- Commons image, licence checked */}
              <img src={s.image.src} alt="" className="aspect-video w-full rounded-control object-cover" />
              <figcaption className="mt-1 truncate text-micro text-muted">
                Image: {s.image.credit.author} · {s.image.credit.license}
              </figcaption>
            </figure>
          )}
        </div>
        <div className="mt-4 grid gap-2">
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={i}
            onChange={(e) => setIndex(Number(e.target.value))}
            aria-label="Step"
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => setIndex(i - 1)}
              className="h-10 flex-1 rounded-full bg-hover text-meta font-semibold text-ink-2 hover:bg-pressed disabled:opacity-40"
            >
              ‹ Previous
            </button>
            <button
              type="button"
              disabled={i === steps.length - 1}
              onClick={() => setIndex(i + 1)}
              className="h-10 flex-1 rounded-full bg-accent text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
