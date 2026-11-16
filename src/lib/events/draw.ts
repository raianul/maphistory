/**
 * How an event's timeline is drawn on a MapLibre map: curved dashed arrows for routes, dots for
 * exact places, soft halos for approximate ones, translucent circles for areas, each in its phase
 * colour. Used by the admin preview now, and by the public event view later (Phase 4), so both
 * look the same. Client-safe.
 */
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { PHASE_PALETTE, type PhaseT, type TimelineStep } from "./schema";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];
type Feature = Extract<GeoData, { type: "FeatureCollection" }>["features"][number];
type Pt = { lat: number; lng: number };

const SRC = { lines: "evt-lines", points: "evt-points", areas: "evt-areas" } as const;
const SRC_PATH = "evt-path";
export const EVENT_LAYERS = ["evt-path", "evt-areas-fill", "evt-areas-line", "evt-lines-casing", "evt-lines", "evt-arrows", "evt-approx", "evt-pulse", "evt-places", "evt-numbers", "evt-labels"];
/** Layers a visitor can click to open a step (its pin or its number). */
export const EVENT_CLICK_LAYERS = ["evt-places", "evt-numbers", "evt-approx"];

/** A step draws something on the map only with a map type and a known location. */
export function drawsOnMap(s: Pick<TimelineStep, "map_type" | "location_precision" | "lat">): boolean {
  return s.map_type !== "none" && s.location_precision !== "unknown" && s.lat !== null && s.lat !== undefined;
}

/** The colour of a step's phase (the brand purple when it has none yet). */
export function stepColor(phases: PhaseT[], phaseId: string | null | undefined): string {
  const p = phases.find((x) => x.id === phaseId);
  return PHASE_PALETTE[p?.color ?? "purple"].hex;
}

/** A gentle curve from a to b (quadratic Bézier bent to one side), as [lng, lat] points. */
export function arc(a: Pt, b: Pt, bend = 0.18, n = 48): [number, number][] {
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

/** A circle of `radiusM` metres around a point, as a polygon ring (accurate enough at these sizes). */
export function circle(c: Pt, radiusM: number, n = 64): [number, number][] {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [c.lng + dLng * Math.cos(a), c.lat + dLat * Math.sin(a)];
  });
}

/** Adds the event layers to a loaded map (empty until drawSteps). Safe to call once per map. */
export function addEventLayers(map: MLMap, white = "#ffffff", ink = "#1f2328"): void {
  if (map.getSource(SRC.lines)) return;
  const empty: GeoData = { type: "FeatureCollection", features: [] };
  map.addSource(SRC.lines, { type: "geojson", data: empty });
  map.addSource(SRC.points, { type: "geojson", data: empty });
  map.addSource(SRC.areas, { type: "geojson", data: empty });
  map.addSource(SRC_PATH, { type: "geojson", data: empty });
  // The story's order: a thin dotted line from place to place (under everything else).
  map.addLayer({
    id: "evt-path",
    type: "line",
    source: SRC_PATH,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ink, "line-width": 1.5, "line-opacity": 0.35, "line-dasharray": [1, 2.5] },
  });
  map.addLayer({ id: "evt-areas-fill", type: "fill", source: SRC.areas, paint: { "fill-color": ["get", "color"], "fill-opacity": ["*", 0.12, ["get", "opacity"]] } });
  map.addLayer({
    id: "evt-areas-line",
    type: "line",
    source: SRC.areas,
    paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": ["*", 0.7, ["get", "opacity"]], "line-dasharray": [3, 2] },
  });
  map.addLayer({
    id: "evt-lines-casing",
    type: "line",
    source: SRC.lines,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": white, "line-width": 7, "line-opacity": ["*", 0.9, ["get", "opacity"]] },
  });
  map.addLayer({
    id: "evt-lines",
    type: "line",
    source: SRC.lines,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 3.5, "line-opacity": ["get", "opacity"], "line-dasharray": [2, 1.4] },
  });
  map.addLayer({
    id: "evt-arrows",
    type: "symbol",
    source: SRC.points,
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
    paint: { "text-color": ["get", "color"], "text-opacity": ["get", "opacity"], "text-halo-color": white, "text-halo-width": 1.5 },
  });
  // Approximate place: a soft halo instead of a precise dot.
  map.addLayer({
    id: "evt-approx",
    type: "circle",
    source: SRC.points,
    // Not with numbered pins (all steps shown): the halo would sit at the real spot, apart from a spread pin.
    filter: ["all", ["==", ["get", "kind"], "place"], ["==", ["get", "approx"], true], ["!", ["has", "num"]]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 16, 14, 34],
      "circle-color": ["get", "color"],
      "circle-opacity": ["*", 0.16, ["get", "opacity"]],
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": ["*", 0.6, ["get", "opacity"]],
    },
  });
  map.addLayer({
    id: "evt-pulse",
    type: "circle",
    source: SRC.points,
    filter: ["all", ["==", ["get", "kind"], "place"], ["==", ["get", "current"], true], ["!=", ["get", "approx"], true]],
    paint: { "circle-radius": 18, "circle-color": ["get", "color"], "circle-opacity": 0.15 },
  });
  map.addLayer({
    id: "evt-places",
    type: "circle",
    source: SRC.points,
    // Numbered pins (all steps shown) are drawn for approximate places too, over their halo.
    filter: ["all", ["==", ["get", "kind"], "place"], ["any", ["!=", ["get", "approx"], true], ["has", "num"]]],
    paint: {
      "circle-radius": ["case", ["has", "num"], ["case", ["get", "current"], 15, 12], ["case", ["get", "current"], 8, 6]],
      "circle-color": ["get", "color"],
      "circle-opacity": ["get", "opacity"],
      "circle-stroke-color": white,
      "circle-stroke-width": 2.5,
      "circle-stroke-opacity": ["get", "opacity"],
    },
  });
  map.addLayer({
    id: "evt-numbers",
    type: "symbol",
    source: SRC.points,
    filter: ["all", ["==", ["get", "kind"], "place"], ["has", "num"]],
    layout: {
      "text-field": ["get", "num"],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["case", ["get", "current"], 14, 12],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": white, "text-opacity": ["get", "opacity"] },
  });
  map.addLayer({
    id: "evt-labels",
    type: "symbol",
    source: SRC.points,
    filter: ["in", ["get", "kind"], ["literal", ["place", "label"]]],
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 13,
      "text-offset": ["case", ["has", "num"], ["literal", [0, 1.6]], ["literal", [0, 1.4]]],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": ink, "text-halo-color": white, "text-halo-width": 1.6, "text-opacity": ["get", "opacity"] },
  });
}

/**
 * Draws the timeline up to and including step `current` (index): earlier steps faded, the current
 * one full strength. Steps with an unknown location (or no map type) draw nothing.
 */
/**
 * Numbered pins closer than this on screen (px) are spread around their common spot, so each stays
 * clickable (e.g. three Dhaka steps at country zoom). Only the drawing moves, not the place.
 */
const SPREAD_PX = 28;

/** Pixel offsets for pins that would overlap at the map's current zoom ([dx, dy] per step index). */
export function spreadOffsets(map: MLMap, pts: { i: number; lng: number; lat: number }[]): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  const screen = pts.map((p) => ({ ...p, xy: map.project([p.lng, p.lat]) }));
  const done = new Set<number>();
  for (const a of screen) {
    if (done.has(a.i)) continue;
    const group = screen.filter((b) => !done.has(b.i) && Math.hypot(a.xy.x - b.xy.x, a.xy.y - b.xy.y) < SPREAD_PX);
    group.forEach((g) => done.add(g.i));
    if (group.length < 2) continue;
    const r = SPREAD_PX * 0.75 + group.length * 2;
    group.forEach((g, k) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * k) / group.length;
      // Offset from where it really is to its place on the small ring around the group's centre.
      const cx = group.reduce((t, q) => t + q.xy.x, 0) / group.length;
      const cy = group.reduce((t, q) => t + q.xy.y, 0) / group.length;
      out.set(g.i, [cx + r * Math.cos(ang) - g.xy.x, cy + r * Math.sin(ang) - g.xy.y]);
    });
  }
  return out;
}

export function drawSteps(map: MLMap, steps: TimelineStep[], phases: PhaseT[], current: number, opts: { all?: boolean } = {}): void {
  const lines: Feature[] = [];
  const areas: Feature[] = [];
  const points = new Map<string, Feature>();
  const all = !!opts.all && current >= 0;
  const bnNum = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });
  /** A point moved by a screen offset (spread pins), back in map coordinates at this zoom. */
  const shifted = (off: [number, number] | undefined, p: Pt): [number, number] => {
    if (!off || (!off[0] && !off[1])) return [p.lng, p.lat];
    const xy = map.project([p.lng, p.lat]);
    const ll = map.unproject([xy.x + off[0], xy.y + off[1]]);
    return [ll.lng, ll.lat];
  };
  const offsets = all ? spreadOffsets(map, steps.flatMap((s, i) => (drawsOnMap(s) ? [{ i, lng: s.lng!, lat: s.lat! }] : []))) : new Map<number, [number, number]>();
  // All steps at once (each place numbered, joined in story order), or the story so far.
  (all ? steps : steps.slice(0, current + 1)).forEach((s, i) => {
    if (!drawsOnMap(s)) return;
    const color = stepColor(phases, s.phase_id);
    const now = i === current;
    const opacity = all ? (now ? 1 : 0.85) : now ? 1 : 0.4;
    const approx = s.location_precision === "approximate";
    const to = { lat: s.lat!, lng: s.lng! };
    const place = (key: string, p: Pt, name: string | null | undefined, isCurrent: boolean, isApprox: boolean, o = opacity) =>
      points.set(key, {
        type: "Feature",
        properties: {
          kind: "place",
          // In "all" mode only the current step is named (numbers say the rest); the step index is kept for clicks.
          name: all && !isCurrent ? "" : (name ?? ""),
          color,
          opacity: o,
          current: isCurrent,
          approx: isApprox,
          step: i,
          ...(all && key.startsWith("p-") ? { num: bnNum(i + 1) } : {}),
        },
        geometry: { type: "Point", coordinates: shifted(key.startsWith("p-") ? offsets.get(i) : undefined, p) },
      });
    if (s.map_type === "area") {
      areas.push({ type: "Feature", properties: { color, opacity }, geometry: { type: "Polygon", coordinates: [circle(to, s.radius_m ?? 500)] } });
      // The circle is the area: only its name in the middle, no extra dot or halo.
      points.set(`p-${i}`, {
        type: "Feature",
        properties: { kind: "label", name: s.place_name ?? "", color, opacity, current: now, approx: false },
        geometry: { type: "Point", coordinates: [to.lng, to.lat] },
      });
    } else if (s.map_type === "route" && s.from_lat !== null && s.from_lat !== undefined) {
      const from = { lat: s.from_lat, lng: s.from_lng! };
      const line = arc(from, to);
      lines.push({ type: "Feature", properties: { color, opacity }, geometry: { type: "LineString", coordinates: line } });
      const [a, b] = [line[line.length - 2], line[line.length - 1]];
      const bearing = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI - 90;
      points.set(`arrow-${i}`, { type: "Feature", properties: { kind: "arrow", color, opacity, bearing }, geometry: { type: "Point", coordinates: b } });
      place(`from-${i}`, from, s.from_place_name, false, approx, opacity * 0.9);
      place(`p-${i}`, to, s.place_name, now, approx);
    } else {
      place(`p-${i}`, to, s.place_name, now, approx);
    }
  });
  const set = (id: string, features: Feature[]) => (map.getSource(id) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  // The order line through every drawn place (all mode only).
  const route = all ? steps.filter(drawsOnMap).map((s) => [s.lng!, s.lat!] as [number, number]) : [];
  set(SRC_PATH, route.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } }] : []);
  set(SRC.lines, lines);
  set(SRC.areas, areas);
  set(SRC.points, [...points.values()]);
}

/** The frame around every drawn step of an event, or nothing when none has a place. */
export function allBounds(steps: TimelineStep[]): [[number, number], [number, number]] | undefined {
  const bs = steps.map(stepBounds).filter((b): b is [[number, number], [number, number]] => !!b);
  if (!bs.length) return undefined;
  return [
    [Math.min(...bs.map((b) => b[0][0])), Math.min(...bs.map((b) => b[0][1]))],
    [Math.max(...bs.map((b) => b[1][0])), Math.max(...bs.map((b) => b[1][1]))],
  ];
}

/** Where to frame the map for a step: its places (and its circle), or nothing for unknown places. */
export function stepBounds(s: TimelineStep): [[number, number], [number, number]] | undefined {
  if (!drawsOnMap(s)) return undefined;
  const pts: Pt[] = [{ lat: s.lat!, lng: s.lng! }];
  if (s.map_type === "route" && s.from_lat !== null && s.from_lat !== undefined) pts.push({ lat: s.from_lat, lng: s.from_lng! });
  if (s.map_type === "area" && s.radius_m) circle(pts[0], s.radius_m, 16).forEach(([lng, lat]) => pts.push({ lat, lng }));
  const lngs = pts.map((p) => p.lng);
  const lats = pts.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** Where step `index`'s numbered pin is drawn right now (after spreading), as [lng, lat]. */
export function drawnPosition(map: MLMap, steps: TimelineStep[], index: number): [number, number] | null {
  const s = steps[index];
  if (!s || !drawsOnMap(s)) return null;
  const off = spreadOffsets(map, steps.flatMap((x, i) => (drawsOnMap(x) ? [{ i, lng: x.lng!, lat: x.lat! }] : []))).get(index);
  if (!off) return [s.lng!, s.lat!];
  const xy = map.project([s.lng!, s.lat!]);
  const ll = map.unproject([xy.x + off[0], xy.y + off[1]]);
  return [ll.lng, ll.lat];
}
