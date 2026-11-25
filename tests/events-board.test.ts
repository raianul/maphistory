import { describe, expect, it } from "vitest";
import { columnOf, nextShown } from "../src/lib/events/board";

const today = { year: 2026, month: 11, day: 25 };

describe("events board", () => {
  it("puts each status in its column", () => {
    expect(columnOf("draft")).toBe("drafts");
    expect(columnOf("research")).toBe("drafts");
    expect(columnOf("review")).toBe("review");
    expect(columnOf("published")).toBe("live");
    expect(columnOf("archived")).toBeNull();
  });

  it("knows when a live event shows next, from its approved dates", () => {
    expect(nextShown([{ month: 12, day: 16 }], today)).toEqual({ month: 12, day: 16, inDays: 21 });
    expect(nextShown([{ month: 11, day: 25 }], today)).toEqual({ month: 11, day: 25, inDays: 0 });
    expect(nextShown([{ month: 3, day: 26 }], today)).toEqual({ month: 3, day: 26, inDays: 121 });
    // The soonest of several dates.
    expect(nextShown([{ month: 3, day: 26 }, { month: 12, day: 14 }, { month: 1, day: 2 }], today)).toEqual({ month: 12, day: 14, inDays: 19 });
    // 29 Feb shows on 28 Feb in 2027.
    expect(nextShown([{ month: 2, day: 29 }], today)).toEqual({ month: 2, day: 28, inDays: 95 });
    expect(nextShown([], today)).toBeNull();
  });
});
