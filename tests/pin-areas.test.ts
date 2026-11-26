import { describe, expect, it } from "vitest";
import { areasOf } from "../src/lib/pin-areas";

describe("zoomed-out area counts", () => {
  it("counts places per square, each circle at their average spot", () => {
    const pts = [
      { lat: 23.71, lng: 90.40 },
      { lat: 23.73, lng: 90.42 },
      { lat: 22.33, lng: 91.83 },
    ];
    const a = areasOf(pts, 0.5).sort((x, y) => y.n - x.n);
    expect(a).toEqual([
      { lat: 23.72, lng: 90.41, n: 2 },
      { lat: 22.33, lng: 91.83, n: 1 },
    ]);
  });

  it("merges a city split by a square's edge", () => {
    const a = areasOf([{ lat: 23.72, lng: 90.39 }, { lat: 23.73, lng: 90.41 }], 0.2);
    expect(a).toHaveLength(1);
    expect(a[0].n).toBe(2);
  });

  it("stays small however many places there are", () => {
    const many = Array.from({ length: 10000 }, (_, i) => ({ lat: 23.7 + (i % 100) / 1000, lng: 90.4 + (i % 7) / 1000 }));
    expect(areasOf(many, 0.5)).toHaveLength(1);
    expect(areasOf(many, 0.5)[0].n).toBe(10000);
  });
});
