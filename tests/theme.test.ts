/** Colour tokens: every period colour used as text stays readable, and the map mirrors the CSS accent. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERA_META, readableText } from "../src/lib/format";
import { THEME } from "../src/lib/theme";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const PAPER = "#fafaf9";

describe("readableText", () => {
  const colours = [...Object.values(ERA_META).map((e) => e.hex), "#d97b0e", "#5c7a29", "#8e4585", "#2f6f9f", "#ffd700"];
  it.each(colours)("%s as small text reaches 4.5:1 on paper", (hex) => {
    expect(contrast(readableText(hex), PAPER)).toBeGreaterThanOrEqual(4.5);
  });
  it("leaves colours that already pass unchanged", () => {
    expect(readableText("#6b5b95")).toBe("#6b5b95");
    expect(readableText("#b8324b")).toBe("#b8324b");
  });
});

describe("tokens", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();

  it("map colours mirror the CSS tokens", () => {
    expect(THEME.accent).toBe(token("accent"));
    expect(THEME.ink).toBe(token("ink"));
    expect(THEME.paper).toBe(token("paper"));
    expect(THEME.mapGround).toBe(token("map-ground"));
  });

  it.each([
    ["ink", "paper"],
    ["ink-2", "paper"],
    ["muted", "paper"],
    ["muted", "card"],
    ["accent", "paper"],
    ["accent", "card"],
    ["accent", "accent-soft"],
    ["accent-hover", "accent-soft-hover"],
    ["on-accent", "accent"],
    ["success", "paper"],
    ["warning", "warning-soft"],
    ["warning", "warning-soft-hover"],
    ["danger", "paper"],
  ])("text %s on %s meets AA", (fg, bg) => {
    expect(contrast(token(fg)!, token(bg)!)).toBeGreaterThanOrEqual(4.5);
  });
});
