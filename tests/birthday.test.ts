import { describe, expect, it } from "vitest";
import { monthDay, parseMonthDay, pickForCard } from "../src/lib/birthday";
import type { Candidate } from "../src/lib/research/discover";

const c = (o: Partial<Candidate>): Candidate => ({
  year: 1971,
  title_bn: "ঘটনা",
  summary_bn: "",
  place: "ঢাকা",
  category: "other",
  source_url: "https://example.org",
  source_quote: "",
  check: { confirmed: true, reason: "", page_title: null },
  ...o,
});

describe("birthday", () => {
  it("reads real dates only, 29 February included", () => {
    expect(parseMonthDay("12-16")).toEqual({ month: 12, day: 16 });
    expect(parseMonthDay("2-29")).toEqual({ month: 2, day: 29 });
    expect(parseMonthDay("02-30")).toBeUndefined();
    expect(parseMonthDay("13-01")).toBeUndefined();
    expect(parseMonthDay("abc")).toBeUndefined();
    expect(monthDay(3, 7)).toBe("03-07");
  });

  it("puts happy, confirmed events on the card, then shows them by year", () => {
    const picked = pickForCard(
      [
        c({ year: 1971, title_bn: "যুদ্ধ", category: "war" }),
        c({ year: 1990, title_bn: "বিশ্ববিদ্যালয় প্রতিষ্ঠা", category: "founding" }),
        c({ year: 1950, title_bn: "গানের জন্ম", category: "culture" }),
        c({ year: 2000, title_bn: "অনিশ্চিত", category: "founding", check: { confirmed: false, reason: "", page_title: null } }),
        c({ year: 1960, title_bn: "দুর্যোগ", category: "disaster" }),
        c({ year: 1990, title_bn: "বিশ্ববিদ্যালয় প্রতিষ্ঠা", category: "founding" }),
      ],
      3,
    );
    expect(picked.map((e) => e.title_bn)).toEqual(["গানের জন্ম", "যুদ্ধ", "বিশ্ববিদ্যালয় প্রতিষ্ঠা"]);
  });
});
