// Client-safe: the admin's Events board (draft → review → live).

import type { EventStatus } from "./schema";

export type Column = "drafts" | "review" | "live";

/** Which column an event sits in (archived ones sit behind a switch, in none). */
export function columnOf(status: EventStatus): Column | null {
  if (status === "draft" || status === "research") return "drafts";
  if (status === "review") return "review";
  if (status === "published") return "live";
  return null;
}

/**
 * When a published event next shows in "On this day": the soonest of its approved dates (an event
 * can have several), 29 February on the 28th in years without one, as visitors see it.
 */
export function nextShown(dates: { month: number; day: number }[], today: { year: number; month: number; day: number }): { month: number; day: number; inDays: number } | null {
  const t = Date.UTC(today.year, today.month - 1, today.day);
  let best: { month: number; day: number; inDays: number } | null = null;
  for (const d of dates) {
    for (const year of [today.year, today.year + 1]) {
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const day = d.month === 2 && d.day === 29 && !leap ? 28 : d.day;
      const at = Date.UTC(year, d.month - 1, day);
      if (at < t) continue;
      const inDays = Math.round((at - t) / 86_400_000);
      if (!best || inDays < best.inDays) best = { month: d.month, day, inDays };
      break;
    }
  }
  return best;
}
