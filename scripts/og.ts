/**
 * Renders a 1200x630 share image per place into public/og/<slug>.png.
 *
 * Why a real browser: next/og (Satori) does not shape Bangla text, so
 * conjuncts break ("কেল্লা" renders as "কেল্‌লা"). Chrome shapes it correctly.
 * The PNGs are committed, so Vercel builds don't need a browser.
 *
 * Usage: pnpm og            all places
 *        pnpm og lalbagh-fort  one place
 * Uses the installed Google Chrome; set CHROME_PATH to use another binary.
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "playwright-core";
import { PlaceMeta, type PlaceMetaT } from "../src/lib/schema";

const ROOT = process.cwd();
const CONTENT = join(ROOT, "content/places");
const OUT = join(ROOT, "public/og");

const ERA = {
  ancient: { bn: "প্রাচীন", color: "#a0522d" },
  sultanate: { bn: "সুলতানি", color: "#2e7d6b" },
  mughal: { bn: "মুঘল", color: "#a8741a" },
  british: { bn: "ব্রিটিশ", color: "#6b5b95" },
  pakistan: { bn: "পাকিস্তান", color: "#3f6f8a" },
  bangladesh: { bn: "বাংলাদেশ", color: "#b8324b" },
} as const;

const bn = new Intl.NumberFormat("bn-BD", { useGrouping: false });

async function dataUri(path: string, mime: string) {
  return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

async function html(p: PlaceMetaT, fonts: string) {
  const era = ERA[p.era];
  const years = p.built.end ? `${bn.format(p.built.start)}–${bn.format(p.built.end)}` : bn.format(p.built.start);
  let hero = "";
  if (p.hero) {
    const file = join(CONTENT, p.slug, "images", p.hero.image);
    const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[
      extname(file).toLowerCase()
    ];
    if (mime && existsSync(file)) hero = await dataUri(file, mime);
  }
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><style>
${fonts}
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; display: flex; background: #f7f3ec; color: #2a2118;
  font-family: "Hind Siliguri", sans-serif; }
.text { flex: 1; padding: 64px; display: flex; flex-direction: column; }
.era { align-self: flex-start; display: flex; gap: 10px; align-items: center; font-size: 28px; font-weight: 600;
  color: ${era.color}; border: 2px solid ${era.color}; border-radius: 999px; padding: 2px 20px; }
.era i { width: 14px; height: 14px; border-radius: 50%; background: ${era.color}; }
h1 { margin-top: 28px; font-size: ${p.name.bn.length > 14 ? 76 : 96}px; font-weight: 700; line-height: 1.25; }
.en { font-size: 30px; color: #6b5e50; }
.meta { margin-top: 12px; font-size: 32px; color: #6b5e50; }
.site { margin-top: auto; font-size: 30px; font-weight: 700; display: flex; justify-content: space-between; }
.site span { font-weight: 400; color: #6b5e50; }
.side { width: ${hero ? 480 : 24}px; background: ${hero ? `url(${hero}) center/cover` : era.color}; }
</style></head><body>
<div class="text">
  <div class="era"><i></i>${era.bn}</div>
  <h1>${esc(p.name.bn)}</h1>
  ${p.name.en ? `<div class="en">${esc(p.name.en)}</div>` : ""}
  <div class="meta">${esc(p.city.bn)} · ${years}${p.built.note ? ` · ${esc(p.built.note.bn)}` : ""}</div>
  <div class="site">জায়গার গল্প <span>jaygargolpo.com</span></div>
</div>
<div class="side"></div>
</body></html>`;
}

async function main() {
  const only = process.argv[2];
  const dirs = (await readdir(CONTENT, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && (!only || d.name === only))
    .map((d) => d.name);
  if (!dirs.length) throw new Error(only ? `No place "${only}"` : "No places found");

  const fontDir = join(ROOT, "assets/fonts");
  const weights = [
    ["Regular", 400],
    ["SemiBold", 600],
    ["Bold", 700],
  ] as const;
  const fonts = (
    await Promise.all(
      weights.map(
        async ([name, weight]) =>
          `@font-face { font-family: "Hind Siliguri"; font-weight: ${weight};
           src: url(${await dataUri(join(fontDir, `HindSiliguri-${name}.ttf`), "font/ttf")}); }`,
      ),
    )
  ).join("\n");

  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" },
  );
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await mkdir(OUT, { recursive: true });

  for (const dir of dirs) {
    const meta = PlaceMeta.parse(JSON.parse(await readFile(join(CONTENT, dir, "place.json"), "utf8")));
    await page.setContent(await html(meta, fonts));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, `${meta.slug}.png`) });
    console.log(`og: public/og/${meta.slug}.png`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
