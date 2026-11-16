/**
 * Which part of the world the public map covers. One switch:
 *
 *   NEXT_PUBLIC_BANGLADESH_ONLY=true   (default) Bangladesh only: the rest of the world is blanked
 *                                      out, the map stays over Bangladesh, and stories (clicks,
 *                                      search, the API) are only for places inside it.
 *   NEXT_PUBLIC_BANGLADESH_ONLY=false  the whole world, as before.
 *
 * NEXT_PUBLIC_ so the same value reaches the browser (map) and the server (API). Client-safe.
 *
 * The outline (src/data/bangladesh.json) is Natural Earth's 1:10m country border (public domain),
 * Bangladesh only, simplified to ~300 m with islets under ~300 m dropped. To regenerate it, take
 * the feature with ISO_A2 "BD" from ne_10m_admin_0_countries.geojson, simplify each outer ring
 * (Douglas–Peucker, 0.003°), drop rings under 0.003° across, round to 4 decimals, then add back the
 * hand-drawn St Martin's Island ring (the last one): Natural Earth 1:10m does not have the island.
 */
import outline from "../data/bangladesh.json";

/** Bangladesh only, unless explicitly switched off. */
export const BANGLADESH_ONLY = process.env.NEXT_PUBLIC_BANGLADESH_ONLY !== "false";

type Ring = [number, number][];
/** The GeoJSON shape outsideMask returns (enough for MapLibre's addSource). */
type PolygonFeature = { type: "Feature"; properties: Record<string, never>; geometry: { type: "Polygon"; coordinates: Ring[] } };
const RINGS = outline.rings as Ring[];
const [WEST, SOUTH, EAST, NORTH] = outline.bbox as [number, number, number, number];

/** Bangladesh's bounding box, as [[west, south], [east, north]]. */
export const BD_BOUNDS: [[number, number], [number, number]] = [
  [WEST, SOUTH],
  [EAST, NORTH],
];

/**
 * How far past the border the map may be moved (degrees). Generous, because outside is blank: it
 * is what lets the map zoom out (MapLibre won't zoom out further than these bounds fill the screen).
 */
const PAD = 8;
/** The map can't be moved or zoomed out beyond this (Bangladesh-only mode). */
export const MAX_BOUNDS: [[number, number], [number, number]] = [
  [WEST - PAD, SOUTH - PAD],
  [EAST + PAD, NORTH + PAD],
];
/** Zoomed out as far as allowed: Bangladesh small in the middle of the screen, with room around it. */
export const BD_MIN_ZOOM = 4.5;

/** Points this close to the border still count as inside (the outline is simplified to ~300 m). */
const SLACK = 0.01; // ~1 km

/** Whether a point is inside the ring (ray casting). */
function inRing([x, y]: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (degrees) from a point to the nearest edge of the ring. */
function distToRing([x, y]: [number, number], ring: Ring): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

/** Whether a place is in Bangladesh (its land or islands, or within about 1 km of the border). */
export function inBangladesh(lat: number, lng: number): boolean {
  if (lng < WEST - SLACK || lng > EAST + SLACK || lat < SOUTH - SLACK || lat > NORTH + SLACK) return false;
  const p: [number, number] = [lng, lat];
  return RINGS.some((r) => inRing(p, r) || distToRing(p, r) <= SLACK);
}

/** Whether the public map may tell this place's story (always true when the whole world is on). */
export function inRegion(lat: number, lng: number): boolean {
  return !BANGLADESH_ONLY || inBangladesh(lat, lng);
}

/**
 * A blank-out mask: the whole world with Bangladesh cut out of it, drawn over the base map so
 * only Bangladesh shows. (Polygon with holes: the outer ring is the world, each island a hole.)
 */
export function outsideMask(): PolygonFeature {
  const world: Ring = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  // Holes go the other way round from the outer ring.
  const holes = RINGS.map((r) => {
    const closed = r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r : [...r, r[0]];
    return signedArea(closed) > 0 ? [...closed].reverse() : closed;
  });
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...holes] } };
}

/** Bangladesh as one MultiPolygon, for map filters ("is this label inside?"). */
export function bangladeshShape(): { type: "MultiPolygon"; coordinates: Ring[][] } {
  return { type: "MultiPolygon", coordinates: RINGS.map((r) => [r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] ? r : [...r, r[0]]]) };
}

/** Positive when the ring runs anticlockwise. */
function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}
