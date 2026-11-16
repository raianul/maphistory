/**
 * The public side's cache of events (Phase 3: "On this day" and event pages read through it).
 * Any change an admin makes to what visitors could see drops it at once, so an unpublished event
 * is never served from cache. Server-side only.
 */
import { revalidateTag } from "next/cache";

export const EVENTS_CACHE_TAG = "historical-events";

/** Stale content is never served after this: the next public request reads the database. */
export function invalidatePublicEvents(): void {
  revalidateTag(EVENTS_CACHE_TAG, { expire: 0 });
}
