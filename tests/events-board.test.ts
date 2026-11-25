import { describe, expect, it } from "vitest";
import { columnOf, nextShown } from "../src/lib/events/board";

const day = (month: number, d: number) => ({ recurring: true, date_precision: "day" as const, event_month: month, event_day: d });
const today = { year: 2026, month: 11, day: 25 };

describe("events board", () => {
  it("puts each status in its column", () => {
    expect(columnOf("draft")).toBe("drafts");
    expect(columnOf("research")).toBe("drafts");
    expect(columnOf("review")).toBe("review");
    expect(columnOf("published")).toBe("live");
    expect(columnOf("archived")).toBeNull();
  });

  it("knows when a live event shows next", () => {
    expect(nextShown(day(12, 16), today)).toEqual({ month: 12, day: 16, inDays: 21 });
    expect(nextShown(day(11, 25), today)).toEqual({ month: 11, day: 25, inDays: 0 });
    expect(nextShown(day(3, 26), today)).toEqual({ month: 3, day: 26, inDays: 121 });
    // 29 Feb shows on 28 Feb in 2027.
    expect(nextShown(day(2, 29), today)).toEqual({ month: 2, day: 28, inDays: 95 });
    expect(nextShown({ ...day(12, 16), recurring: false }, today)).toBeNull();
    expect(nextShown({ ...day(12, 16), date_precision: "year" }, today)).toBeNull();
  });
});
