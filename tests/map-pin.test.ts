/** A pin must reopen the very story it was made from: same name, place and kind as saved. */
import { describe, expect, it } from "vitest";
import { pinTarget, type MapPin } from "../src/lib/map-pin";

describe("pinTarget", () => {
  const pin: MapPin = { label: "লালবাগ কেল্লা", name: "লালবাগ কেল্লা", lat: 23.7189, lng: 90.3882, kind: "attraction", verified: true };

  it("asks for the story by what it was saved under, not by its display label", () => {
    const relabelled = { ...pin, label: "Lalbagh Fort (Mughal)" };
    expect(pinTarget(relabelled)).toEqual({ name: "লালবাগ কেল্লা", lat: 23.7189, lng: 90.3882, kind: "attraction" });
  });

  it("keeps the exact saved coordinates and kind (the lookup radius depends on the kind)", () => {
    const t = pinTarget({ ...pin, kind: "road or street (primary)" });
    expect(t.lat).toBe(23.7189);
    expect(t.kind).toBe("road or street (primary)");
  });
});
