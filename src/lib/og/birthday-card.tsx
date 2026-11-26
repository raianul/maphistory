/**
 * The birthday card as an image: "১৬ ডিসেম্বর-এ জন্ম? সেই দিনে বাংলাদেশে যা ঘটেছিল" and the day's
 * events. Two sizes: a link preview (1200×630, Facebook/WhatsApp) and a story (1080×1920, to
 * download and post). Bangla text is shaped with HarfBuzz (bangla-text.ts). Server-side only.
 */
import { ImageResponse } from "next/og";
import type { BirthdayEvent } from "../birthday";
import { markSvg } from "../logo";
import { SITE } from "../places";
import { THEME } from "../theme";
import { banglaSvg, svgDataUrl, type ShapedText } from "./bangla-text";

const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });

/** "১৬ ডিসেম্বর" */
export const dayLabel = (month: number, day: number) => `${bn(day)} ${MONTHS_BN[month - 1]}`;

const img = (t: ShapedText) => (
  // eslint-disable-next-line @next/next/no-img-element -- drawn into the generated image
  <img src={svgDataUrl(t.svg)} width={t.width} height={t.height} alt="" />
);

export async function birthdayCard({ month, day, events, format }: { month: number; day: number; events: BirthdayEvent[]; format: "link" | "story" }): Promise<Response> {
  const story = format === "story";
  const size = story ? { width: 1080, height: 1920 } : { width: 1200, height: 630 };
  // The link card is shown wide, square or tall depending on the app (Facebook's phone app crops it
  // to a near-square from the middle): everything is centred, inside the middle 600 px.
  const inner = story ? size.width - 160 : 600;
  const shown = events.slice(0, story ? 5 : 3);
  const muted = "#5b5f66";
  const [eyebrow, title, sub, wordmark, domain, ...rows] = await Promise.all([
    banglaSvg("আপনার জন্মদিনে বাংলাদেশে", { size: story ? 40 : 28, color: THEME.accent, maxWidth: inner, maxLines: 1 }),
    banglaSvg(`${dayLabel(month, day)}-এ জন্ম?`, { size: story ? 104 : 72, color: THEME.ink, maxWidth: inner, maxLines: 2 }),
    banglaSvg(shown.length ? "সেই দিনে যা ঘটেছিল:" : "সেই দিনের ইতিহাস দেখুন", { size: story ? 44 : 30, color: muted, maxWidth: inner, maxLines: 1, weight: "Regular" }),
    banglaSvg(SITE.name, { size: story ? 44 : 32, color: THEME.ink, maxWidth: 500, maxLines: 1, fontFile: "Fraunces-SemiBold" }),
    banglaSvg(`${SITE.domain}/birthday`, { size: story ? 32 : 22, color: muted, maxWidth: 600, maxLines: 1, weight: "Regular" }),
    ...shown.flatMap((e) => [
      banglaSvg(bn(e.year), { size: story ? 54 : 30, color: THEME.accent, maxWidth: 220, maxLines: 1 }),
      banglaSvg(e.title_bn, { size: story ? 50 : 28, color: THEME.ink, maxWidth: inner - (story ? 200 : 100), maxLines: story ? 3 : 1, weight: "Regular", lineHeight: 1.3 }),
    ]),
  ]);
  const mark = { svg: markSvg({ pin: THEME.accent, amp: "#ffffff" }), width: story ? 48 : 34, height: story ? 60 : 42 };

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f8f4f0", position: "relative" }}>
        {story ? (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, display: "flex", background: THEME.accent }} />
        ) : (
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 12, display: "flex", background: THEME.accent }} />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            padding: story ? "170px 80px 130px" : "40px 72px 30px",
            justifyContent: "space-between",
            alignItems: story ? "stretch" : "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: story ? 18 : 4, alignItems: story ? "flex-start" : "center" }}>
            {img(eyebrow)}
            {img(title)}
            <div style={{ display: "flex", marginTop: story ? 10 : 2 }}>{img(sub)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: story ? 64 : 10, alignItems: story ? "flex-start" : "center" }}>
            {shown.map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: story ? 34 : 14 }}>
                <div style={story ? { display: "flex", width: 176, flexShrink: 0 } : { display: "flex", flexShrink: 0 }}>{img(rows[i * 2])}</div>
                {img(rows[i * 2 + 1])}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: story ? 18 : 12 }}>
            {img({ ...mark, svg: mark.svg })}
            {img(wordmark)}
            <div style={{ display: "flex", marginLeft: story ? 24 : 10 }}>{img(domain)}</div>
          </div>
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
