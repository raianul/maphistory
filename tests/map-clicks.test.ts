import { describe, expect, it } from "vitest";
import { CLICKABLE_LAYER, opensStory } from "../src/lib/map-clicks";

describe("which map names open a story", () => {
  it("areas, water and points of interest are clickable layers; roads and transit are not", () => {
    for (const id of ["label_town", "label_village", "label_other", "water_name_line_label", "waterway_line_label", "poi_r1", "poi_r20"]) expect(CLICKABLE_LAYER.test(id)).toBe(true);
    for (const id of ["highway-name-major", "highway-name-minor", "poi_transit", "airport"]) expect(CLICKABLE_LAYER.test(id)).toBe(false);
  });

  it("only heritage points of interest", () => {
    const poi = (cls: string, subclass?: string) => ({ sourceLayer: "poi", properties: { class: cls, subclass } });
    expect(opensStory(poi("place_of_worship", "mosque"))).toBe(true);
    expect(opensStory(poi("museum"))).toBe(true);
    expect(opensStory(poi("monument"))).toBe(true);
    expect(opensStory(poi("attraction"))).toBe(true);
    expect(opensStory(poi("shop", "clothes"))).toBe(false);
    expect(opensStory(poi("restaurant"))).toBe(false);
    expect(opensStory(poi("bank"))).toBe(false);
    expect(opensStory(poi("office"))).toBe(false);
    // An area or a river name is always fine.
    expect(opensStory({ sourceLayer: "place", properties: { class: "suburb" } })).toBe(true);
    expect(opensStory({ sourceLayer: "water_name", properties: {} })).toBe(true);
  });
});
