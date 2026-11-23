// Client-safe: the shape of a pin on the public map (filled by db.ts on the server).

/** A pin on the public map: a saved story the admin switched on ("ম্যাপে পিন"). */
export type MapPin = {
  /** Shown on the map: the story's own Bangla name. */
  label: string;
  /** The story's English name, for English map labels (shown instead when the visitor picks EN). */
  label_en?: string;
  /** The place's page address (/place/<slug>), once it has one. */
  slug?: string;
  /** What the story is saved under (the map name as clicked): opening the pin finds the saved story by it. */
  name: string;
  lat: number;
  lng: number;
  kind?: string;
  verified: boolean;
};

/**
 * The story a pin opens: exactly the map name, place and kind the story was saved under, so
 * the saved story is found by the usual lookup and served as is (never written again).
 */
export function pinTarget(p: MapPin): { name: string; lat: number; lng: number; kind?: string; slug?: string } {
  return { name: p.name, lat: p.lat, lng: p.lng, kind: p.kind, ...(p.slug ? { slug: p.slug } : {}) };
}
