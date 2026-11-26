/**
 * How many pins each part of the country has, for the zoomed-out map: the pins themselves load
 * only from city zoom (see tiles.ts), so further out the map shows one numbered circle per area
 * instead. Two sizes of area: large squares for the whole country, smaller ones a step closer.
 * Only counts and positions (a few KB however many places there are), read from the database at
 * most every ten minutes. Server-side only.
 */
import { unstable_cache } from "next/cache";
import { db } from "./db";
import { inRegion } from "./region";

export type PinArea = { lat: number; lng: number; n: number };

/** Square sizes in degrees: about 55 km (country view) and 22 km (a step closer). */
const COARSE = 0.5;
const FINE = 0.2;

/** Groups points into squares of `size` degrees; each circle sits at its places' average spot. */
export function areasOf(points: { lat: number; lng: number }[], size: number): PinArea[] {
  const cells = new Map<string, { lat: number; lng: number; n: number }>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / size)}:${Math.floor(p.lng / size)}`;
    const c = cells.get(key) ?? { lat: 0, lng: 0, n: 0 };
    c.lat += p.lat;
    c.lng += p.lng;
    c.n += 1;
    cells.set(key, c);
  }
  // A city on a square's edge is split in two: circles closer than half a square are merged
  // (the bigger first), so they never sit on top of each other.
  const merged: PinArea[] = [];
  for (const c of [...cells.values()].map((c) => ({ lat: c.lat / c.n, lng: c.lng / c.n, n: c.n })).sort((x, y) => y.n - x.n)) {
    const near = merged.find((m) => Math.hypot(m.lat - c.lat, m.lng - c.lng) < size / 2);
    if (!near) merged.push({ ...c });
    else {
      const n = near.n + c.n;
      near.lat = (near.lat * near.n + c.lat * c.n) / n;
      near.lng = (near.lng * near.n + c.lng * c.n) / n;
      near.n = n;
    }
  }
  const round = (v: number) => Math.round(v * 1e4) / 1e4;
  return merged.map((c) => ({ lat: round(c.lat), lng: round(c.lng), n: c.n }));
}

async function load(): Promise<{ coarse: PinArea[]; fine: PinArea[] }> {
  const { data, error } = await db().from("stories").select("lat,lng").eq("show_on_map", true).in("status", ["verified", "ai"]).limit(50000);
  // Before the show_on_map migration: no pins, no circles.
  if (error?.code === "42703" || error?.code === "PGRST204") return { coarse: [], fine: [] };
  if (error) throw new Error(`Database: ${error.message}`);
  const points = ((data ?? []) as { lat: number; lng: number }[]).filter((p) => inRegion(p.lat, p.lng));
  return { coarse: areasOf(points, COARSE), fine: areasOf(points, FINE) };
}

export const pinAreas = unstable_cache(load, ["pin-areas-v2"], { revalidate: 600 });
