import { describe, expect, it } from "vitest";
import { nextDays } from "../src/lib/admin-home";
import { ago } from "../src/lib/format";

describe("admin Home", () => {
  it("the next 7 days start today in Bangladesh, across a month end", () => {
    // 20:00 UTC on 30 Nov is already 1 Dec in Dhaka (UTC+6).
    const d = nextDays(new Date("2026-11-30T20:00:00Z"));
    expect(d).toHaveLength(7);
    expect(d[0]).toEqual({ year: 2026, month: 12, day: 1 });
    expect(d[6]).toEqual({ year: 2026, month: 12, day: 7 });
    expect(nextDays(new Date("2026-12-29T00:00:00Z")).at(-1)).toEqual({ year: 2027, month: 1, day: 4 });
  });

  it("says how long ago, simply", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    expect(ago("2026-11-25T11:59:30Z", now)).toBe("Just now");
    expect(ago("2026-11-25T09:00:00Z", now)).toBe("3 hours ago");
    expect(ago("2026-11-25T11:00:00Z", now)).toBe("1 hour ago");
    expect(ago("2026-11-24T08:00:00Z", now)).toBe("Yesterday");
    expect(ago("2026-11-21T12:00:00Z", now)).toBe("4 days ago");
    expect(ago("2026-11-10T12:00:00Z", now)).toBe("10 Nov");
  });
});
