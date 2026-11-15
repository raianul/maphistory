/**
 * Shared map setup for the public map and the admin map: the base style with
 * Bangla labels. The whole world is shown. Runs in the browser.
 */
import type { StyleSpecification } from "maplibre-gl";

// Free OpenStreetMap vector tiles, no API key. A quiet base style so pins stand out.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

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
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || !layer.layout?.["text-field"]) continue;
    if (layer.id.includes("shield")) continue;
    layer.layout["text-field"] = ["coalesce", ["get", "name:bn"], ["get", "name"]];
    // Spaced-out letters break up Bangla words.
    layer.layout["text-letter-spacing"] = 0;
  }
  return style;
}
