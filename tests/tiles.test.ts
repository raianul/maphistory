/** Tile maths: the same squares every web map uses, so browser and server agree on addresses. */
import { describe, expect, it } from "vitest";
import { isValidTile, tileBounds, tileOf, tilesInView } from "../src/lib/tiles";

describe("tileOf", () => {
  it("puts Old Dhaka in the standard square 10/769/442", () => {
    expect(tileOf(23.716, 90.399, 10)).toEqual({ z: 10, x: 769, y: 442 });
  });
  it("zoom 0 is one square for the whole world", () => {
    expect(tileOf(51.5, -0.12, 0)).toEqual({ z: 0, x: 0, y: 0 });
    expect(tileOf(-33.9, 151.2, 0)).toEqual({ z: 0, x: 0, y: 0 });
  });
  it("clamps the poles and the date line instead of going out of range", () => {
    expect(tileOf(89.9, 180, 10)).toEqual({ z: 10, x: 1023, y: 0 });
    expect(tileOf(-89.9, -180, 10)).toEqual({ z: 10, x: 0, y: 1023 });
  });
});

describe("tileBounds", () => {
  it("contains the point it came from", () => {
    for (const [lat, lng] of [
      [23.716, 90.399],
      [41.89, 12.49],
      [-22.9, -43.2],
      [40.71, -74.0],
    ]) {
      const b = tileBounds(tileOf(lat, lng));
      expect(lat).toBeGreaterThanOrEqual(b.south);
      expect(lat).toBeLessThan(b.north);
      expect(lng).toBeGreaterThanOrEqual(b.west);
      expect(lng).toBeLessThan(b.east);
    }
  });
  it("neighbouring squares share an edge (no gaps, no overlaps)", () => {
    const a = tileBounds({ z: 10, x: 769, y: 442 });
    expect(tileBounds({ z: 10, x: 770, y: 442 }).west).toBeCloseTo(a.east, 10);
    expect(tileBounds({ z: 10, x: 769, y: 443 }).north).toBeCloseTo(a.south, 10);
  });
});

describe("isValidTile", () => {
  it("accepts real squares and rejects nonsense", () => {
    expect(isValidTile({ z: 10, x: 769, y: 442 })).toBe(true);
    expect(isValidTile({ z: 10, x: 1024, y: 0 })).toBe(false);
    expect(isValidTile({ z: 10, x: -1, y: 0 })).toBe(false);
    expect(isValidTile({ z: 10, x: 1.5, y: 0 })).toBe(false);
    expect(isValidTile({ z: 99, x: 0, y: 0 })).toBe(false);
  });
});

describe("tilesInView", () => {
  it("a city on screen is a handful of squares", () => {
    const tiles = tilesInView({ south: 23.65, west: 90.3, north: 23.8, east: 90.5 });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(4);
    expect(tiles).toContainEqual({ z: 10, x: 769, y: 442 });
  });
  it("handles a screen across the date line", () => {
    const tiles = tilesInView({ south: -17.5, west: 179.5, north: -17, east: -179.5 });
    const xs = new Set(tiles.map((t) => t.x));
    expect(xs.has(1023)).toBe(true);
    expect(xs.has(0)).toBe(true);
  });
  it("never asks for more than the cap", () => {
    expect(tilesInView({ south: -60, west: -180, north: 70, east: 180 }, 10, 64)).toHaveLength(64);
  });
});
