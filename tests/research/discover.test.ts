/**
 * "On this day" discovery with a fake Gemini and a fake web: invented, dead and wrong-date sources
 * must come back unconfirmed; malformed and duplicate entries are dropped.
 */
import { describe, expect, it } from "vitest";
import { datePatterns, discoverEvents, discoverPrompt, extractJson, pageStatesDate } from "../../src/lib/research/discover";
import { isAbroad } from "../../src/lib/research/generate";
import { quoteFound } from "../../src/lib/research/validate";

const PAGES: Record<string, string> = {
  "https://en.wikipedia.org/wiki/Shaheed_Minar": `<title>Shaheed Minar</title><p>${"Background text. ".repeat(20)} It was inaugurated on 21 February 1963, by the mother of Abul Barkat.</p>`,
  "https://bn.wikipedia.org/wiki/Boimela": `<title>বইমেলা</title><p>${"পটভূমি। ".repeat(60)} ১৯৭২ সালের ২১শে ফেব্রুয়ারি চিত্তরঞ্জন সাহা বাংলা একাডেমি প্রাঙ্গণে বই বিক্রি শুরু করেন।</p>`,
  "https://example.org/wrong-day": `<title>Elsewhere</title><p>${"Filler words here. ".repeat(20)} The cyclone struck on 15 November 2007 and the next day…</p>`,
  "https://example.org/no-year": `<title>No year</title><p>${"Filler words here. ".repeat(20)} Every year on 21 February people gather. In 1999 something else happened far away in a long sentence that keeps going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going and going on.</p>`,
};
const fakeFetch = (async (url: string) => {
  const body = PAGES[url];
  return body ? new Response(body, { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 });
}) as unknown as typeof fetch;
const resolve = (async () => [{ address: "93.184.215.14", family: 4 }]) as never;
const ev = (o: Record<string, unknown>) => ({ year: 1963, title_bn: "শহীদ মিনার উদ্বোধন", summary_bn: "x", place: "ঢাকা", category: "culture", source_url: "https://en.wikipedia.org/wiki/Shaheed_Minar", source_quote: "inaugurated on 21 February 1963", ...o });
const ask = (answer: unknown) => async () => (typeof answer === "string" ? answer : "Here you go:\n```json\n" + JSON.stringify(answer) + "\n```");

describe("date matching", () => {
  it("finds English and Bangla forms of the date near the year", () => {
    expect(pageStatesDate("It was inaugurated on 21 February 1963.", 21, 2, 1963)).toBe(true);
    expect(pageStatesDate("On February 21st, 1963 it opened.", 21, 2, 1963)).toBe(true);
    expect(pageStatesDate("১৯৭২ সালের ২১শে ফেব্রুয়ারি বইমেলা শুরু।", 21, 2, 1972)).toBe(true);
    expect(pageStatesDate("৫ মার্চ ১৯৭১", 5, 3, 1971)).toBe(true);
  });
  it("rejects a different day, a different year, or a day that only appears inside a bigger number", () => {
    expect(pageStatesDate("struck on 15 November 2007", 16, 11, 2007)).toBe(false);
    expect(pageStatesDate("on 21 February 1952", 21, 2, 1963)).toBe(false);
    expect(pageStatesDate("on 121 February 1963", 21, 2, 1963)).toBe(false);
    expect(datePatterns(1, 3).some((r) => r.test("11 march"))).toBe(false);
  });
});

describe("discoverEvents (fake Gemini)", () => {
  it("confirms only events whose page states the date; invented, dead and wrong-date links are unconfirmed", async () => {
    const { candidates, dropped } = await discoverEvents(21, 2, "BD", {
      fetch: fakeFetch,
      resolve,
      ask: ask({
        events: [
          ev({}),
          ev({ year: 1972, title_bn: "একুশে বইমেলার সূচনা", source_url: "https://bn.wikipedia.org/wiki/Boimela", source_quote: "x" }),
          ev({ year: 1952, title_bn: "বানানো সূত্র", source_url: "https://invented.example.com/proof" }),
          ev({ year: 2007, title_bn: "ভুল দিন", source_url: "https://example.org/wrong-day" }),
          ev({ year: 1999, title_bn: "সাল নেই", source_url: "https://example.org/no-year" }),
          ev({ year: 1990, title_bn: "ইন্টারনাল", source_url: "http://169.254.169.254/latest/meta-data" }),
        ],
      }),
    });
    expect(dropped).toBe(0);
    const by = Object.fromEntries(candidates.map((c) => [c.title_bn, c.check]));
    expect(by["শহীদ মিনার উদ্বোধন"]).toMatchObject({ confirmed: true, reason: expect.stringMatching(/quote and the date/) });
    expect(by["একুশে বইমেলার সূচনা"]).toMatchObject({ confirmed: true, reason: expect.stringMatching(/not an exact match/) });
    expect(by["বানানো সূত্র"].confirmed).toBe(false);
    expect(by["ভুল দিন"].confirmed).toBe(false);
    expect(by["সাল নেই"].confirmed).toBe(false);
    expect(by["ইন্টারনাল"]).toMatchObject({ confirmed: false, reason: expect.stringMatching(/Could not open/) });
    expect(candidates.map((c) => c.year)).toEqual([...candidates.map((c) => c.year)].sort((a, b) => a - b));
  });

  it("drops malformed entries, non-http links and duplicates; ignores extra fields; cleans [url](url)", async () => {
    const { candidates, dropped } = await discoverEvents(21, 2, "BD", {
      fetch: fakeFetch,
      resolve,
      ask: ask({
        events: [
          ev({ verified: true, status: "published" }),
          ev({}), // duplicate
          ev({ title_bn: "জাভাস্ক্রিপ্ট", source_url: "javascript:alert(1)" }),
          { title_bn: "সাল নেই" },
          "not an object",
          ev({ year: 1972, title_bn: "মার্কডাউন লিংক", source_url: "[x](https://bn.wikipedia.org/wiki/Boimela)" }),
        ],
      }),
    });
    expect(candidates.map((c) => c.title_bn)).toEqual(["শহীদ মিনার উদ্বোধন", "মার্কডাউন লিংক"]);
    expect(dropped).toBe(4);
    expect(JSON.stringify(candidates)).not.toMatch(/"verified"|"status"/);
    expect(candidates[1]).toMatchObject({ source_url: "https://bn.wikipedia.org/wiki/Boimela", check: { confirmed: true } });
  });

  it("an empty answer is fine (a quiet day); prose without JSON is an error", async () => {
    expect((await discoverEvents(16, 11, "BD", { fetch: fakeFetch, resolve, ask: ask({ events: [] }) })).candidates).toEqual([]);
    await expect(discoverEvents(16, 11, "BD", { fetch: fakeFetch, resolve, ask: ask("On this day nothing much happened.") })).rejects.toThrow();
  });

  it("caps the list at 7", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ev({ year: 1900 + i, title_bn: `ঘটনা ${i}` }));
    expect((await discoverEvents(21, 2, "BD", { fetch: fakeFetch, resolve, ask: ask({ events: many }) })).candidates).toHaveLength(7);
  });
});

describe("prompt and parsing", () => {
  it("asks for the exact day in the chosen country and forbids invented URLs", () => {
    const p = discoverPrompt(16, 11, "BD");
    expect(p).toMatch(/Bangladesh/);
    expect(p).toMatch(/16 November exactly/);
    expect(p).toMatch(/Never invent/);
  });
  it("extracts JSON from fenced or chatty answers", () => {
    expect(extractJson('Sure!\n```json\n{"events":[]}\n```')).toEqual({ events: [] });
    expect(extractJson("no json")).toBeNull();
  });
});

describe("places and quotes in generated drafts", () => {
  it("never pins places the AI names as abroad (a same-named Bangladeshi village would be wrong)", () => {
    expect(isAbroad("Jagatdal, North 24 Parganas, West Bengal, India")).toBe(true);
    expect(isAbroad("Kolkata Port, Kolkata, India")).toBe(true);
    expect(isAbroad("করাচি, পাকিস্তান")).toBe(true);
    expect(isAbroad("Dhaka Medical College, Dhaka, Bangladesh")).toBe(false);
    expect(isAbroad("Ajmiriganj, Habiganj, Bangladesh")).toBe(false);
  });
  it("matches quotes across footnote markers", () => {
    expect(quoteFound("police opened fire and killed a number of students", "police opened fire [15] and killed a number of students [44].")).toBe(true);
    expect(quoteFound("জন্মগ্রহণ করেন ঢাকায় এক সম্ভ্রান্ত পরিবারে", "জন্মগ্রহণ করেন[১] ঢাকায় এক সম্ভ্রান্ত পরিবারে")).toBe(true);
  });
});
