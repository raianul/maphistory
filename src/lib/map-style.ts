/**
 * Shared map setup for the public map and the admin maps: the base style (OpenFreeMap "bright",
 * OpenStreetMap data) with Bangla labels. Runs in the browser.
 */
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

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
export async function loadStyle(lang: MapLang = "bn"): Promise<StyleSpecification> {
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
    layer.layout["text-field"] = labelField(lang);
    // Spaced-out letters break up Bangla words.
    layer.layout["text-letter-spacing"] = 0;
  }
  return style;
}

// ── Map label language ─────────────────────────────────────────────────────────────────

/** The language of the base map's place names. Content stays Bangla (browsers translate it). */
export type MapLang = "bn" | "en";
const MAP_LANG_KEY = "ondor-map-lang";

/** The label expression: names in that language, else the local name. */
export function labelField(lang: MapLang): ExpressionSpecification {
  return lang === "en" ? ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]] : ["coalesce", ["get", "name:bn"], ["get", "name"]];
}

/**
 * The visitor's map language: their saved choice, else English for browsers not set to Bangla
 * (foreign visitors), else Bangla. Server side and before the browser is known: Bangla.
 */
export function initialMapLang(fallback: MapLang = "bn"): MapLang {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(MAP_LANG_KEY);
    if (saved === "bn" || saved === "en") return saved;
  } catch {
    // storage blocked
  }
  if (fallback === "en") return "en";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((l) => /^bn\b/i.test(l)) || !langs.some((l) => /^en\b/i.test(l)) ? "bn" : "en";
}

export function saveMapLang(lang: MapLang): void {
  try {
    localStorage.setItem(MAP_LANG_KEY, lang);
  } catch {
    // storage blocked: the choice lasts for this visit
  }
}

/** Switches a loaded map's place names to another language (no reload). Our own layers are left alone. */
export function setMapLang(map: { getStyle(): { layers: { id: string; type: string; layout?: Record<string, unknown> }[] }; setLayoutProperty(id: string, k: string, v: unknown): void }, lang: MapLang, skip: (id: string) => boolean): void {
  for (const l of map.getStyle().layers) {
    if (l.type !== "symbol" || !l.layout?.["text-field"] || l.id.includes("shield") || skip(l.id)) continue;
    map.setLayoutProperty(l.id, "text-field", labelField(lang));
  }
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
