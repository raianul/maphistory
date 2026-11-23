/**
 * Bangla text for generated images (share cards). Next's image generator can't shape Bangla
 * conjuncts (ন্ত, ক্ষ, শ্ব come out broken), so the text is shaped here with HarfBuzz, the engine
 * browsers use, and turned into SVG outlines, which the image generator draws as they are.
 * Server-side only.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

type Hb = {
  createBlob(b: ArrayBuffer | Uint8Array): { destroy(): void };
  createFace(blob: unknown, index: number): { upem: number; destroy(): void };
  createFont(face: unknown): { glyphToPath(g: number): string; destroy(): void };
  createBuffer(): { addText(t: string): void; guessSegmentProperties(): void; json(): { g: number; ax: number; dx: number; dy: number }[]; destroy(): void };
  shape(font: unknown, buffer: unknown): void;
};

let hbPromise: Promise<Hb> | null = null;
const fonts = new Map<string, Promise<Uint8Array>>();

async function harfbuzz(): Promise<Hb> {
  // harfbuzzjs exports a promise of the ready instance (it loads its own .wasm next to it). Loaded
  // with require, unbundled (serverExternalPackages in next.config.ts): import() would treat the
  // exported promise as a module namespace, and bundling breaks the path to its .wasm.
  hbPromise ??= createRequire(import.meta.url)("harfbuzzjs") as Promise<Hb>;
  return hbPromise;
}

/** The project's Bangla font (Hind Siliguri), read once. */
function font(weight: "Regular" | "SemiBold"): Promise<Uint8Array> {
  const file = join(process.cwd(), "public", "fonts", `HindSiliguri-${weight}.ttf`);
  if (!fonts.has(file)) fonts.set(file, readFile(file));
  return fonts.get(file)!;
}

export type ShapedText = { svg: string; width: number; height: number };

/**
 * `text` drawn at `size` px in `color`, wrapped to `maxWidth` (at most `maxLines`, the last one
 * ending in "…" if cut), as an SVG with outlines: ready for an <img> in a generated image.
 */
export async function banglaSvg(
  text: string,
  { size, color, maxWidth, maxLines = 2, weight = "SemiBold", lineHeight = 1.35 }: { size: number; color: string; maxWidth: number; maxLines?: number; weight?: "Regular" | "SemiBold"; lineHeight?: number },
): Promise<ShapedText> {
  const hb = await harfbuzz();
  const blob = hb.createBlob(await font(weight));
  const face = hb.createFace(blob, 0);
  const hbFont = hb.createFont(face);
  const scale = size / face.upem;
  try {
    const shape = (t: string) => {
      const buf = hb.createBuffer();
      buf.addText(t);
      buf.guessSegmentProperties();
      hb.shape(hbFont, buf);
      const glyphs = buf.json();
      buf.destroy();
      return { glyphs, width: glyphs.reduce((w, g) => w + g.ax, 0) * scale };
    };
    // Greedy wrap by words, measured shaped (Bangla widths depend on the conjuncts formed).
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && shape(next).width > maxWidth) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last.includes(" ") && shape(`${last}…`).width > maxWidth) last = last.slice(0, last.lastIndexOf(" "));
      lines[maxLines - 1] = `${last}…`;
    }
    const step = size * lineHeight;
    const ascent = size * 1.05; // Hind Siliguri's tall Bangla marks fit within ~1.05 em above the baseline
    let width = 0;
    const paths: string[] = [];
    lines.forEach((l, i) => {
      const { glyphs, width: w } = shape(l);
      width = Math.max(width, w);
      let x = 0;
      for (const g of glyphs) {
        const d = hbFont.glyphToPath(g.g);
        if (d) paths.push(`<path transform="translate(${((x + g.dx) * scale).toFixed(2)} ${(ascent + i * step - g.dy * scale).toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${d}"/>`);
        x += g.ax;
      }
    });
    const height = Math.ceil(ascent + (lines.length - 1) * step + size * 0.45);
    width = Math.ceil(width) + 2;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="${color}">${paths.join("")}</g></svg>`, width, height };
  } finally {
    hbFont.destroy();
    face.destroy();
    blob.destroy();
  }
}

/** An SVG as a data URL for <img src>. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
