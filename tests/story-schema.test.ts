/**
 * The story format: old (v1, saved before the global engine) and new (v2)
 * stories must both validate and display; Gemini's answer format and our
 * validation schema must agree; the AI is never asked for sources.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AiStoryData, RESPONSE_SCHEMA, storyPrompt, StoryPeriod, StoryPeriodFields } from "../src/lib/ai/place-story";
import { periodDisplay, periodStart } from "../src/lib/format";

const FIXTURES = join(__dirname, "fixtures");
const load = (prefix: string) =>
  readdirSync(FIXTURES)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ file: f, json: JSON.parse(readFileSync(join(FIXTURES, f), "utf8")) }));

const v1 = load("v1-");
const v2 = load("v2-");

describe("saved v1 stories (fixed South Asian periods) still work", () => {
  it("has real v1 fixtures to test against", () => expect(v1.length).toBeGreaterThan(0));

  for (const { file, json } of v1) {
    it(`${file} validates`, () => {
      const r = AiStoryData.safeParse(json);
      expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    });

    it(`${file} shows its periods with the old names, colors and order`, () => {
      const story = AiStoryData.parse(json);
      const shown = story.periods.map((p, i) => periodDisplay(p, i, story.country));
      for (const d of shown) {
        expect(d.bn).not.toBe("অজানা আমল");
        expect(d.hex).toMatch(/^#[0-9a-f]{6}$/);
      }
      const starts = story.periods.map(periodStart);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    });
  }

  it("a v1 'pakistan' period means East Pakistan in Bangladesh and today's Pakistan in Pakistan", () => {
    expect(periodDisplay({ period: "pakistan" }, 0, "BD").bn).toBe("পূর্ব পাকিস্তান আমল");
    expect(periodDisplay({ period: "pakistan" }, 0, "PK").bn).toBe("পাকিস্তান");
  });
});

describe("v2 stories (periods described by the AI)", () => {
  for (const { file, json } of v2) {
    it(`${file} validates and keeps its own period names`, () => {
      const story = AiStoryData.parse(json);
      expect(story.schema_version).toBe(2);
      story.periods.forEach((p, i) => expect(periodDisplay(p, i, story.country).bn).toBe(p.label_bn));
    });
  }

  const rome = {
    name_bn: "রোম",
    name_en: "Rome",
    country: "it",
    kind_bn: "শহর",
    summary_bn: "…",
    era: "roman", // not a known v1 era: dropped, not fatal
    periods: [
      { label_bn: "রোমান সাম্রাজ্য", start_year: -27, end_year: 476, intro_bn: "…" },
      {
        label_bn: "রোমান প্রজাতন্ত্র",
        start_year: -509,
        end_year: -27,
        intro_bn: "…",
        events: [{ when_bn: "খ্রিস্টপূর্ব ৫০৯", sort_year: -509, title_bn: "…", body_bn: "…", confidence: "high", evidence_level: "made_up" }],
      },
    ],
  };

  it("normalises the country code and drops unknown optional values instead of failing", () => {
    const story = AiStoryData.parse(rome);
    expect(story.country).toBe("IT");
    expect(story.era).toBeUndefined();
    expect(story.periods[1].events?.[0].evidence_level).toBeUndefined();
    expect(AiStoryData.parse({ ...rome, country: "Italy" }).country).toBeUndefined();
  });

  it("orders BCE periods correctly and gives neighbouring periods different colors", () => {
    const story = AiStoryData.parse(rome);
    const sorted = [...story.periods].sort((a, b) => periodStart(a) - periodStart(b));
    expect(sorted.map((p) => p.label_bn)).toEqual(["রোমান প্রজাতন্ত্র", "রোমান সাম্রাজ্য"]);
    const [a, b] = sorted.map((p, i) => periodDisplay(p, i));
    expect(a.hex).not.toBe(b.hex);
    expect(a.range).toBe("খ্রিস্টপূর্ব ৫০৯–খ্রিস্টপূর্ব ২৭");
  });

  it("rejects a period with neither a v2 label nor a v1 key", () => {
    expect(StoryPeriod.safeParse({ intro_bn: "…" }).success).toBe(false);
    expect(StoryPeriod.safeParse({ period: "mughal", intro_bn: "…" }).success).toBe(true);
    expect(StoryPeriod.safeParse({ label_bn: "ডাচ ঔপনিবেশিক যুগ", intro_bn: "…" }).success).toBe(true);
  });
});

describe("Gemini's answer format and our validation agree", () => {
  const zodKeys = new Set(Object.keys(AiStoryData.shape));
  const periodKeys = new Set(Object.keys(StoryPeriodFields.shape));

  it("every field Gemini may return is known to the validator", () => {
    for (const key of Object.keys(RESPONSE_SCHEMA.properties)) expect(zodKeys, key).toContain(key);
  });

  it("every period field Gemini may return is known to the validator", () => {
    const props = (RESPONSE_SCHEMA.properties.periods.items as { properties: object }).properties;
    for (const key of Object.keys(props)) expect(periodKeys, key).toContain(key);
  });

  it("never asks the AI for sources, provenance or the format version (those are ours to fill)", () => {
    for (const key of ["sources", "provenance", "schema_version"]) expect(Object.keys(RESPONSE_SCHEMA.properties)).not.toContain(key);
  });

  it("keeps the name and photo phrase before kind_bn, so the photo search can start early", () => {
    const order = Object.keys(RESPONSE_SCHEMA.properties);
    expect(order.indexOf("name_en")).toBeLessThan(order.indexOf("kind_bn"));
    expect(order.indexOf("photo_query_en")).toBeLessThan(order.indexOf("kind_bn"));
  });
});

describe("the prompt for one place", () => {
  it("is not tied to South Asia and carries the real location context", () => {
    const prompt = storyPrompt({
      name: "Colosseum",
      lat: 41.8902,
      lng: 12.4922,
      kind: "historic monument",
      nearby: ["Arch of Constantine"],
      context: { countryCode: "IT", country: "Italy", region: "Lazio", city: "Rome" },
    });
    expect(prompt).not.toMatch(/Bangladesh|India|Pakistan/);
    expect(prompt).toContain("Rome, Lazio, Italy (country code IT)");
    expect(prompt).toContain("Nearby map labels: Arch of Constantine");
  });

  it("still works without location context", () => {
    expect(storyPrompt({ name: "আজিমপুর", lat: 23.7253, lng: 90.3835 })).toContain("Name on the map: আজিমপুর");
  });
});
