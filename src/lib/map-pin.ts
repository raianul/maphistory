// Client-safe: the shape of a pin on the public map (filled by db.ts on the server).

/** A pin on the public map: a saved story the admin switched on ("ম্যাপে পিন"). */
export type MapPin = {
  /** Shown on the map: the story's own Bangla name. */
  label: string;
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
export function pinTarget(p: MapPin): { name: string; lat: number; lng: number; kind?: string } {
  return { name: p.name, lat: p.lat, lng: p.lng, kind: p.kind };
}
