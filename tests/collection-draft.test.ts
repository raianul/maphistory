import { describe, expect, it } from "vitest";
import { draftCollection } from "../src/lib/collection-draft";
import type { GeoResult } from "../src/lib/geocode";
import { parseLatLng } from "../src/lib/format";

// The AI's answer (untrusted) and the map search are both faked: no network, no database.
const answer = JSON.stringify({
  title_en: "Old Dhaka in a day",
  intro_bn: "পুরান ঢাকার চারটি জায়গা।",
  places: [
    { name_bn: "আহসান মঞ্জিল", name_en: "Ahsan Manzil", note_bn: "নবাবদের প্রাসাদ।", lat: 23.7086, lng: 90.4061 },
    { name_bn: "তারা মসজিদ", name_en: "Star Mosque", note_bn: "তারা-খচিত।", lat: 23.715, lng: 90.401 },
    { name_bn: "কল্পিত দুর্গ", name_en: "Imaginary Fort", note_bn: "নেই।" },
    { name_bn: "কলকাতার জাদুঘর", name_en: "Indian Museum", note_bn: "ভারতে।", lat: 22.558, lng: 88.351 },
    { name_bn: "আহসান মঞ্জিল প্রাসাদ", name_en: "Ahsan Manzil Palace", note_bn: "আবার।", lat: 23.7086, lng: 90.4061 },
    { nonsense: true },
  ],
});
const map: Record<string, GeoResult[]> = {
  "Ahsan Manzil": [{ name: "Ahsan Manzil", context: "Dhaka", lat: 23.70862, lng: 90.40615, kind: "tourism=museum" }],
  // Two "Star Mosque"s: the one near the AI's guess is chosen.
  "Star Mosque": [
    { name: "Star Mosque", context: "Rajshahi", lat: 24.37, lng: 88.6, kind: "amenity=place_of_worship" },
    { name: "Star Mosque", context: "Dhaka", lat: 23.7153, lng: 90.4011, kind: "amenity=place_of_worship" },
  ],
  "Ahsan Manzil Palace": [{ name: "Ahsan Manzil", context: "Dhaka", lat: 23.70862, lng: 90.40615, kind: "tourism=museum" }],
};
const search = async (q: string) => map[q] ?? [];

describe("Draft with AI (collections)", () => {
  it("keeps real places in Bangladesh, located on the map, each once", async () => {
    const d = await draftCollection("পুরান ঢাকার এক দিন", undefined, { ask: async () => answer, search });
    expect(d.title_en).toBe("Old Dhaka in a day");
    expect(d.places.map((p) => p.name_en)).toEqual(["Ahsan Manzil", "Star Mosque"]);
    expect(d.places[1]).toMatchObject({ lat: 23.7153, lng: 90.4011, kind: "amenity=place_of_worship", approximate: false });
    // No database here: nothing matches a saved story, so both are new.
    expect(d.places.every((p) => p.story_id === null)).toBe(true);
    expect(d.dropped.map((x) => x.name)).toEqual(["কল্পিত দুর্গ", "কলকাতার জাদুঘর"]);
  });

  it("uses the AI's own location when the map search finds nothing (marked approximate)", async () => {
    const d = await draftCollection("x", undefined, {
      ask: async () => JSON.stringify({ places: [{ name_bn: "নতুন জায়গা", name_en: "Somewhere", note_bn: "", lat: 23.8, lng: 90.4 }] }),
      search: async () => [],
    });
    expect(d.places[0]).toMatchObject({ lat: 23.8, lng: 90.4, approximate: true, kind: "" });
  });

  it("fails clearly on an answer it can't read", async () => {
    await expect(draftCollection("x", undefined, { ask: async () => "sorry", search })).rejects.toThrow(/AI's answer/);
  });
});

describe("pasted coordinates (Move pin)", () => {
  it("reads what Google Maps copies", () => {
    expect(parseLatLng("23.7104, 90.4074")).toEqual({ lat: 23.7104, lng: 90.4074 });
    expect(parseLatLng(" 23.7104 90.4074 ")).toEqual({ lat: 23.7104, lng: 90.4074 });
    expect(parseLatLng("(23.7, 90.4)")).toEqual({ lat: 23.7, lng: 90.4 });
    expect(parseLatLng("Dhaka")).toBeUndefined();
    expect(parseLatLng("95, 90")).toBeUndefined();
  });
});
