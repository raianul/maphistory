/**
 * Share cards (og:image, 1200×630) for places and the home page. All text is shaped with HarfBuzz
 * (bangla-text.ts) so Bangla renders correctly; the place's photo, when it has one, fills the card.
 * Server-side only.
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { SITE_URL } from "../site";
import { THEME } from "../theme";
import { banglaSvg, svgDataUrl } from "./bangla-text";

export const CARD = { width: 1200, height: 630 };

/** The photo as a data URL (fetched here with a time limit, so a slow image never breaks the card). */
async function photoData(src: string | undefined): Promise<string | undefined> {
  if (!src) return undefined;
  try {
    // A photo of a hand-written place: a file in public/.
    if (src.startsWith("/")) {
      const ext = src.split(".").pop()?.toLowerCase();
      const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const buf = await readFile(join(process.cwd(), "public", decodeURIComponent(src.split("?")[0]).replace(/\.\.+/g, "")));
      return buf.length > 4_000_000 ? undefined : `data:${type};base64,${buf.toString("base64")}`;
    }
    const res = await fetch(src, { headers: { "User-Agent": `Ondor/0.1 (${SITE_URL}; share card)` }, signal: AbortSignal.timeout(6000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type)) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return undefined;
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

const img = (svg: { svg: string; width: number; height: number }) => (
  // eslint-disable-next-line @next/next/no-img-element -- drawn into the generated image, not a page
  <img src={svgDataUrl(svg.svg)} width={svg.width} height={svg.height} alt="" />
);

/** A place's card: name (large), era line, Ondor wordmark; over its photo when there is one. */
export async function placeCard({ name, line, photo }: { name: string; line?: string; photo?: string }): Promise<Response> {
  const bg = await photoData(photo);
  const ink = bg ? "#ffffff" : THEME.ink;
  const muted = bg ? "rgba(255,255,255,0.88)" : "#5b5f66";
  const [title, sub, mark, tag] = await Promise.all([
    banglaSvg(name, { size: name.length > 22 ? 68 : 84, color: ink, maxWidth: 1040, maxLines: 2 }),
    line ? banglaSvg(line, { size: 34, color: muted, maxWidth: 1040, maxLines: 1, weight: "Regular" }) : Promise.resolve(undefined),
    banglaSvg("Ondor", { size: 40, color: bg ? "#ffffff" : THEME.accent, maxWidth: 400, maxLines: 1 }),
    banglaSvg("Every Place Has a Past.", { size: 24, color: muted, maxWidth: 500, maxLines: 1, weight: "Regular" }),
  ]);
  const png = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: bg ? "#1f2328" : "#f8f4f0" }}>
        {bg && (
          // eslint-disable-next-line @next/next/no-img-element -- drawn into the generated image
          <img src={bg} alt="" width={CARD.width} height={CARD.height} style={{ position: "absolute", left: 0, top: 0, width: CARD.width, height: CARD.height, objectFit: "cover" }} />
        )}
        {/* Darkens the photo where the text is, so it reads on any picture. */}
        {/* (Satori ignores `inset`: the layers get an explicit size.) */}
        {bg && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: CARD.width,
              height: CARD.height,
              display: "flex",
              backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.3) 35%, rgba(0,0,0,0.72) 60%, rgba(0,0,0,0.88) 100%)",
            }}
          />
        )}
        {!bg && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, display: "flex", background: THEME.accent }} />}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", height: "100%", padding: "56px 72px" }}>
          {img(title)}
          {sub && <div style={{ display: "flex", marginTop: 8 }}>{img(sub)}</div>}
          <div style={{ display: "flex", alignItems: "center", marginTop: 36, gap: 18 }}>
            {img(mark)}
            {img(tag)}
          </div>
        </div>
      </div>
    ),
    CARD,
  );
  // A card over a photo is 1–2 MB as PNG, too big for some apps' link previews (WhatsApp): as
  // JPEG it is ~150 KB. The plain card stays PNG (small already, and sharper text).
  const body = bg ? await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer() : await png.arrayBuffer();
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": bg ? "image/jpeg" : "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
