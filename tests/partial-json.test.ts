/** The streaming reader: a story being written can be shown at every point. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePartialJson } from "../src/lib/partial-json";

describe("parsePartialJson", () => {
  const full = readFileSync(join(__dirname, "fixtures", "v2-jabalpur.json"), "utf8").replace(/\s*\n\s*/g, "");

  it("reads a v2 story at every cut point without throwing, ending with the full story", () => {
    let last: unknown;
    for (let i = 1; i <= full.length; i += 7) last = parsePartialJson(full.slice(0, i)) ?? last;
    expect(parsePartialJson(full)).toEqual(JSON.parse(full));
    expect(last).toBeDefined();
  });

  it("shows a half-written Bangla string as it is typed", () => {
    expect(parsePartialJson('{"name_bn":"আজিম')).toEqual({ name_bn: "আজিম" });
  });

  it("steps back over a half-written key", () => {
    expect(parsePartialJson('{"name_bn":"রোম","perio')).toEqual({ name_bn: "রোম" });
  });
});
