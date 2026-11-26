// Client-safe: which names on the base map open a story when clicked.

/**
 * Base-map label layers that can be clicked: towns, villages and areas (label_*), points of
 * interest (poi_r*, filtered below), rivers and lakes. Not road names, airports or transit stops,
 * where an AI "history" is weakest.
 */
export const CLICKABLE_LAYER = /^(poi_r|label_|water_name|waterway)/;

/**
 * Points of interest worth a story: heritage and landmarks (by the map's class or subclass, from
 * OpenStreetMap). Shops, restaurants, banks, offices, schools, clinics and the like are not.
 */
const STORY_POI = new Set([
  "attraction",
  "museum",
  "monument",
  "memorial",
  "castle",
  "fort",
  "palace",
  "manor",
  "ruins",
  "archaeological_site",
  "city_gate",
  "place_of_worship",
  "mosque",
  "temple",
  "church",
  "college",
  "university",
  "town_hall",
  "library",
  "theatre",
  "art_gallery",
  "cemetery",
  "grave_yard",
  "park",
  "garden",
  "stadium",
  "zoo",
]);

/** A clicked feature opens a story: any area, town or water name; only heritage points of interest. */
export function opensStory(f: { sourceLayer?: string; properties?: Record<string, unknown> | null }): boolean {
  if (f.sourceLayer !== "poi") return true;
  const cls = f.properties?.class;
  const sub = f.properties?.subclass;
  return (typeof cls === "string" && STORY_POI.has(cls)) || (typeof sub === "string" && STORY_POI.has(sub));
}
