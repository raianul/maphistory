/**
 * The world as fixed squares ("tiles"), the same scheme every web map uses:
 * zoom 0 is one square, each zoom level splits every square into 4. A square
 * is addressed z/x/y. Pins are loaded per square at PIN_TILE_ZOOM, so a visitor
 * downloads only the few squares on screen, and everyone looking at the same
 * area asks for the same squares (so the answers can be cached). Client-safe.
 */

/** Pins are fetched in squares of this zoom (about 36 km wide at Dhaka's latitude). */
export const PIN_TILE_ZOOM = 10;
/** Pins are shown, and squares fetched, from this map zoom in. */
export const PIN_MIN_ZOOM = 10;
/** At most this many pins per square (most important first); a busy square shows its best ones. */
export const PINS_PER_TILE = 300;

const MAX_LAT = 85.0511287798; // web maps stop here (square world)

export type Tile = { z: number; x: number; y: number };
export type Bounds = { south: number; west: number; north: number; east: number };

/** The square containing a point. */
export function tileOf(lat: number, lng: number, z = PIN_TILE_ZOOM): Tile {
  const n = 2 ** z;
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** A square's edges in degrees. */
export function tileBounds({ z, x, y }: Tile): Bounds {
  const n = 2 ** z;
  const lng = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return { west: lng(x), east: lng(x + 1), north: lat(y), south: lat(y + 1) };
}

/** Whether z/x/y is a real square. */
export function isValidTile({ z, x, y }: Tile): boolean {
  const n = 2 ** z;
  return Number.isInteger(z) && Number.isInteger(x) && Number.isInteger(y) && z >= 0 && z <= 22 && x >= 0 && y >= 0 && x < n && y < n;
}

/** The squares covering what is on screen (wraps around the date line). Capped, so a huge screen can't ask for hundreds. */
export function tilesInView(b: Bounds, z = PIN_TILE_ZOOM, max = 64): Tile[] {
  const n = 2 ** z;
  const nw = tileOf(b.north, b.west, z);
  const se = tileOf(b.south, b.east, z);
  // Crossing the date line: east < west in longitude, so walk x across the wrap.
  const width = b.east - b.west >= 360 ? n : (se.x - nw.x + n) % n + 1;
  const tiles: Tile[] = [];
  for (let dy = nw.y; dy <= se.y; dy++) {
    for (let i = 0; i < Math.min(width, n); i++) {
      tiles.push({ z, x: (nw.x + i) % n, y: dy });
      if (tiles.length >= max) return tiles;
    }
  }
  return tiles;
}

export const tileKey = ({ z, x, y }: Tile) => `${z}/${x}/${y}`;
