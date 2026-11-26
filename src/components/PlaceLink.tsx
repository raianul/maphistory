"use client";

/** How a place was opened, for analytics (place_open's "source"). */
export type PlaceSource = "link" | "pin" | "map" | "nearby" | "search" | "explore" | "on_this_day" | "collection";

/** Asks the map (PlaceMap) to open a place's page in place, without reloading: detail { slug, source }. */
export const OPEN_PLACE = "ondor:open-place";

/** Asks the map to open an event (its timeline), from a place's "এখানে যা ঘটেছিল": detail { slug, step }. */
export const OPEN_EVENT = "ondor:open-event";

/**
 * A link to a place's page (/place/<slug>). A plain click opens it in the map (no reload); a new
 * tab, a crawler or a copied link gets the real page.
 */
export function PlaceLink({ slug, source, className, children }: { slug: string; source: PlaceSource; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`/place/${slug}`}
      className={className ?? "text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(OPEN_PLACE, { detail: { slug, source } }));
      }}
    >
      {children}
    </a>
  );
}
