/**
 * Colour values the map needs as plain strings (MapLibre paint properties
 * can't read CSS variables). These mirror the tokens in app/globals.css;
 * change both together. Client-safe.
 */
export const THEME = {
  /** Brand accent (purple): actions, selection, focus. 5.7:1 on paper. */
  accent: "#6b5b95",
  /** The accent as a faint fill, for a selected place's halo on the map. */
  accentHalo: "rgba(107,91,149,0.14)",
  ink: "#1f2328",
  paper: "#fafaf9",
  white: "#ffffff",
  /** Map background while tiles load (matches the base map's land colour); also the blank-out outside Bangladesh. */
  mapGround: "#f4f4f3",
  /** The thin line along Bangladesh's border (Bangladesh-only mode). */
  borderLine: "#c9c6d6",
} as const;
