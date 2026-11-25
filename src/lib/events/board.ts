// Client-safe: the admin's Events board (draft → review → live).

import type { EventListRow, EventStatus } from "./schema";

export type Column = "drafts" | "review" | "live";

/** Which column an event sits in (archived ones sit behind a switch, in none). */
export function columnOf(status: EventStatus): Column | null {
  if (status === "draft" || status === "research") return "drafts";
  if (status === "review") return "review";
  if (status === "published") return "live";
  return null;
}

/**
 * When a published event next shows in "On this day": every year on its day when it recurs and
 * its exact day is known (29 Feb → 28 Feb in other years, as the public rule); otherwise never by
 * itself (its extra dates, if any, are set in the editor).
 */
export function nextShown(e: Pick<EventListRow, "recurring" | "date_precision" | "event_month" | "event_day">, today: { year: number; month: number; day: number }): { month: number; day: number; inDays: number } | null {
  if (!e.recurring || e.date_precision !== "day" || !e.event_month || !e.event_day) return null;
  const t = Date.UTC(today.year, today.month - 1, today.day);
  for (const year of [today.year, today.year + 1]) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const day = e.event_month === 2 && e.event_day === 29 && !leap ? 28 : e.event_day;
    const at = Date.UTC(year, e.event_month - 1, day);
    if (at >= t) return { month: e.event_month, day, inDays: Math.round((at - t) / 86_400_000) };
  }
  return null;
}
