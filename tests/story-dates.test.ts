/** Stories with several "On this day" dates: the rules for dates, step dates, kinds and identity. */
import { describe, expect, it } from "vitest";
import { DateFields, EventFields, StepFields, stepOnDate } from "../src/lib/events/schema";
import { validateReport } from "../src/lib/research/validate";
import { wikidataIdFor } from "../src/lib/research/sources";
import type { ResearchSource } from "../src/lib/research/types";

const event = { slug: "kazi-nazrul-islam", title: "কাজী নজরুল ইসলাম", date_precision: "day", event_year: 1899, event_month: 5, event_day: 25 };
const step = { title: "জন্ম", map_type: "none", location_precision: "unknown", evidence: "documented" };

describe("dates of a story", () => {
  it("accepts a real Gregorian date with its own headline", () => {
    expect(DateFields.safeParse({ year: 1976, month: 7, day: 21, title: "কর্নেল তাহেরের ফাঁসি" }).success).toBe(true);
  });
  it("refuses impossible days, 29 Feb outside leap years, a missing headline and year 0", () => {
    expect(DateFields.safeParse({ year: 1976, month: 4, day: 31, title: "x" }).success).toBe(false);
    expect(DateFields.safeParse({ year: 1975, month: 2, day: 29, title: "x" }).success).toBe(false);
    expect(DateFields.safeParse({ year: 1976, month: 2, day: 29, title: "x" }).success).toBe(true);
    expect(DateFields.safeParse({ year: 1976, month: 7, day: 21, title: " " }).success).toBe(false);
    expect(DateFields.safeParse({ year: 0, month: 7, day: 21, title: "x" }).success).toBe(false);
  });
  it("finds the step on a date (where the story opens that day)", () => {
    const steps = [
      { id: "a", step_year: 1975, step_month: 11, step_day: 24 },
      { id: "b", step_year: 1976, step_month: 7, step_day: 21 },
      { id: "c", step_year: 1976, step_month: 7, step_day: null },
    ];
    expect(stepOnDate(steps, { year: 1976, month: 7, day: 21 })).toBe("b");
    expect(stepOnDate(steps, { year: 1976, month: 7, day: 22 })).toBeNull();
  });
});

describe("step dates", () => {
  it("year, year + month, or a full real date", () => {
    expect(StepFields.safeParse({ ...step, step_year: 1971 }).success).toBe(true);
    expect(StepFields.safeParse({ ...step, step_year: 1971, step_month: 3 }).success).toBe(true);
    expect(StepFields.safeParse({ ...step, step_year: 1971, step_month: 3, step_day: 26 }).success).toBe(true);
  });
  it("refuses a day without a month, a month without a year, and impossible days", () => {
    expect(StepFields.safeParse({ ...step, step_year: 1971, step_day: 26 }).success).toBe(false);
    expect(StepFields.safeParse({ ...step, step_month: 3 }).success).toBe(false);
    expect(StepFields.safeParse({ ...step, step_year: 1971, step_month: 2, step_day: 30 }).success).toBe(false);
  });
});

describe("story kind and identity", () => {
  it("defaults to an event; a person is allowed; the Wikidata id is checked and upper-cased", () => {
    expect(EventFields.parse(event).kind).toBe("event");
    expect(EventFields.parse({ ...event, kind: "person" }).kind).toBe("person");
    expect(EventFields.parse({ ...event, wikidata_id: "q7241" }).wikidata_id).toBe("Q7241");
    expect(EventFields.parse({ ...event, wikidata_id: "" }).wikidata_id).toBeNull();
    expect(EventFields.safeParse({ ...event, wikidata_id: "7241" }).success).toBe(false);
    expect(EventFields.safeParse({ ...event, kind: "place" }).success).toBe(false);
  });
});

describe("AI report: kind and step dates", () => {
  const S: ResearchSource[] = [
    { id: "S1", title: "t", url: "https://en.wikipedia.org/wiki/X", publisher: "Wikipedia", author: null, published_on: null, source_type: "encyclopedia", origin: "wikipedia", language: "en", retrieval: "retrieved", excerpt: "Kazi Nazrul Islam was born on 25 May 1899 in Churulia.", retrieved_at: "" },
  ];
  const claim = { text: "x", citations: [{ source_id: "S1", quote: "Kazi Nazrul Islam was born on 25 May 1899" }], evidence: "moderate" };
  const report = (steps: object[], kind?: string) => ({ overview: { title: "কাজী নজরুল ইসলাম", kind, summary: claim, date_precision: "day" }, phases: [], steps, disagreements: [], gaps: [], source_notes: {} });

  it("keeps the kind (person) and a step's real date; an unknown kind becomes event", () => {
    const r = validateReport(report([{ ...claim, title: "জন্ম", order: 0, location_precision: "unknown", map_type: "none", year: 1899, month: 5, day: 25 }], "person"), S)!;
    expect(r.overview.kind).toBe("person");
    expect(r.steps[0]).toMatchObject({ year: 1899, month: 5, day: 25 });
    expect(validateReport(report([], "planet"), S)!.overview.kind).toBe("event");
  });
  it("keeps only as much of a step's date as is real", () => {
    const r = validateReport(
      report([
        { ...claim, title: "a", order: 0, location_precision: "unknown", map_type: "none", year: 1976, month: 4, day: 31 },
        { ...claim, title: "b", order: 1, location_precision: "unknown", map_type: "none", year: 1976, day: 12 },
        { ...claim, title: "c", order: 2, location_precision: "unknown", map_type: "none", month: 3, day: 7 },
      ]),
      S,
    )!;
    expect(r.steps.map((s) => [s.year, s.month, s.day])).toEqual([
      [1976, 4, null],
      [1976, null, null],
      [null, null, null],
    ]);
  });
});

describe("Wikidata identity from a Wikipedia article", () => {
  const net = (title: string, props: Record<string, string>) =>
    (async () => Response.json({ query: { pages: [{ title, pageprops: props }] } })) as unknown as typeof fetch;
  it("reads the article's Wikidata id", async () => {
    expect(await wikidataIdFor("https://en.wikipedia.org/wiki/Kazi_Nazrul_Islam", net("Kazi Nazrul Islam", { wikibase_item: "Q312715" }))).toBe("Q312715");
  });
  it("ignores lists, timelines, year pages, disambiguations and non-Wikipedia links", async () => {
    expect(await wikidataIdFor("https://en.wikipedia.org/wiki/List_of_Bangladeshi_poets", net("List of Bangladeshi poets", { wikibase_item: "Q1" }))).toBeNull();
    expect(await wikidataIdFor("https://en.wikipedia.org/wiki/X", net("Timeline of the Bangladesh Liberation War", { wikibase_item: "Q2" }))).toBeNull();
    expect(await wikidataIdFor("https://en.wikipedia.org/wiki/1976", net("1976", { wikibase_item: "Q3" }))).toBeNull();
    expect(await wikidataIdFor("https://en.wikipedia.org/wiki/Taher", net("Taher", { wikibase_item: "Q4", disambiguation: "" }))).toBeNull();
    expect(await wikidataIdFor("https://www.banglapedia.org/x", net("x", { wikibase_item: "Q5" }))).toBeNull();
  });
});
