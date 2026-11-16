/** The Bangladesh-only map: what counts as inside, and the blank-out mask. */
import { describe, expect, it } from "vitest";
import { inBangladesh, outsideMask } from "../src/lib/region";

describe("inBangladesh", () => {
  it.each([
    ["Old Dhaka", 23.716, 90.399],
    ["Chattogram", 22.3569, 91.7832],
    ["Cox's Bazar", 21.4272, 92.0058],
    ["St Martin's Island", 20.6237, 92.3234],
    ["Sylhet", 24.8949, 91.8687],
    ["Rajshahi", 24.3745, 88.6042],
    ["Teknaf", 20.8624, 92.3058],
    ["Tetulia (northern tip)", 26.4826, 88.3542],
    ["Bhola island", 22.6859, 90.6482],
    ["Sundarbans (Bangladesh side)", 21.95, 89.18],
  ])("%s is inside", (_name, lat, lng) => {
    expect(inBangladesh(lat, lng)).toBe(true);
  });

  it.each([
    ["Kolkata", 22.5726, 88.3639],
    ["Agartala (Tripura, India)", 23.8315, 91.2868],
    ["Shillong (Meghalaya, India)", 25.5788, 91.8933],
    ["Siliguri (India)", 26.7271, 88.3953],
    ["Sittwe (Myanmar)", 20.1462, 92.8983],
    ["Bay of Bengal, open sea", 19.5, 90.0],
    ["Rome", 41.8902, 12.4922],
    ["New York", 40.7128, -74.006],
  ])("%s is outside", (_name, lat, lng) => {
    expect(inBangladesh(lat, lng)).toBe(false);
  });
});

describe("outsideMask", () => {
  const ringArea = (r: number[][]) => r.reduce((a, p, i) => a + (r[(i + 1) % r.length][0] - p[0]) * (r[(i + 1) % r.length][1] + p[1]), 0) / 2;

  it("is the world with Bangladesh cut out (holes wound against the outer ring)", () => {
    const [world, ...holes] = outsideMask().geometry.coordinates;
    expect(holes.length).toBeGreaterThan(5); // mainland + islands
    const outerSign = Math.sign(ringArea(world));
    for (const h of holes) {
      expect(Math.sign(ringArea(h))).toBe(-outerSign);
      expect(h[0]).toEqual(h.at(-1)); // closed
    }
  });
});
