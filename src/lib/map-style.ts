/**
 * Shared map setup for the public map and the admin maps: the base style (OpenFreeMap "bright",
 * OpenStreetMap data) with Bangla labels. Runs in the browser.
 */
import type { StyleSpecification } from "maplibre-gl";

// Free OpenStreetMap vector tiles, no API key. "bright": the familiar map colours (blue water,
// green parks and forests, yellow main roads) in soft tones, so pins still stand out.
const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

/**
 * Base-map layers left out: transit stops (bus/rail/airport icons with long English names) and
 * one-way arrows. Clutter on a history map.
 */
const HIDDEN_LAYERS = /^(poi_transit|road_oneway|road_oneway_opposite)$/;

/** How far out the map can zoom: the whole world, not smaller. */
export const MIN_ZOOM = 1.5;

/**
 * The base style, patched so labels show Bangla names (falling back to the
 * local name) drawn with Hind Siliguri. MapLibre's `font-faces` lets the
 * browser shape the text, which keeps Bangla conjuncts intact.
 */
export async function loadStyle(): Promise<StyleSpecification> {
  const style: StyleSpecification = await (await fetch(STYLE_URL)).json();
  // Attach Hind Siliguri to the base style's own font names, for Bangla
  // codepoints only: Latin still comes from the tile server's glyphs.
  const bangla = { url: "/fonts/HindSiliguri-Regular.ttf", "unicode-range": ["U+0980-09FF", "U+200C-200D", "U+25CC"] };
  const banglaBold = { ...bangla, url: "/fonts/HindSiliguri-SemiBold.ttf" };
  style["font-faces"] = {
    "Noto Sans Regular": [bangla],
    "Noto Sans Italic": [bangla],
    "Noto Sans Bold": [banglaBold],
  };
  style.layers = style.layers.filter((l) => !HIDDEN_LAYERS.test(l.id));
  // Bus stops and similar transit points also come through the general place layers: leave them out.
  const noTransit = ["!", ["match", ["get", "class"], ["bus", "rail", "railway", "ferry_terminal", "aerialway"], true, false]];
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || !/^poi/.test(layer.id)) continue;
    layer.filter = (layer.filter ? ["all", layer.filter, noTransit] : noTransit) as typeof layer.filter;
  }
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || !layer.layout?.["text-field"]) continue;
    if (layer.id.includes("shield")) continue;
    layer.layout["text-field"] = ["coalesce", ["get", "name:bn"], ["get", "name"]];
    // Spaced-out letters break up Bangla words.
    layer.layout["text-letter-spacing"] = 0;
  }
  return style;
}

/**
 * Keeps a MapLibre map flat and north-up: no turning or tilting with right-drag, ctrl-drag,
 * a two-finger twist or the keyboard (easy to do by accident, and there is no compass to undo it).
 */
export function lockFlat(map: { dragRotate: { disable(): void }; touchZoomRotate: { disableRotation(): void }; touchPitch: { disable(): void }; keyboard: { disableRotation(): void }; setMaxPitch(p: number): unknown }): void {
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.touchPitch.disable();
  map.keyboard.disableRotation();
  map.setMaxPitch(0);
}
