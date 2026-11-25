// Client-safe helpers: no content data imported here, so map code stays small.
import type { Era } from "./schema";

export const ERA_META: Record<Era, { bn: string; en: string; color: string; hex: string }> = {
  ancient: { bn: "প্রাচীন", en: "Ancient", color: "var(--era-ancient)", hex: "#a0522d" },
  sultanate: { bn: "সুলতানি", en: "Sultanate", color: "var(--era-sultanate)", hex: "#2e7d6b" },
  mughal: { bn: "মুঘল", en: "Mughal", color: "var(--era-mughal)", hex: "#a8741a" },
  british: { bn: "ব্রিটিশ", en: "British", color: "var(--era-british)", hex: "#6b5b95" },
  pakistan: { bn: "পাকিস্তান", en: "East Pakistan", color: "var(--era-pakistan)", hex: "#3f6f8a" },
  bangladesh: { bn: "বাংলাদেশ", en: "Bangladesh", color: "var(--era-bangladesh)", hex: "#b8324b" },
};

/**
 * LEGACY: the fixed South Asian periods used by stories saved before the
 * global engine (schema v1). New stories describe their own periods
 * (label_bn, range_bn, start_year …); these keys are only read, never written.
 */
export const LEGACY_PERIODS = ["pre_mughal", "mughal", "british", "pakistan", "bangladesh", "india"] as const;
export type LegacyPeriod = (typeof LEGACY_PERIODS)[number];

const LEGACY_PERIOD_META: Record<LegacyPeriod, { bn: string; short: string; range: string; hex: string; start: number }> = {
  pre_mughal: { bn: "প্রাচীন ও সুলতানি আমল", short: "প্রাচীন", range: "১৫৭৬ পর্যন্ত", hex: "#2e7d6b", start: 0 },
  mughal: { bn: "মুঘল আমল", short: "মুঘল", range: "১৫৭৬–১৭৫৭", hex: "#a8741a", start: 1576 },
  british: { bn: "ব্রিটিশ আমল", short: "ব্রিটিশ", range: "১৭৫৭–১৯৪৭", hex: "#6b5b95", start: 1757 },
  pakistan: { bn: "পূর্ব পাকিস্তান আমল", short: "পাকিস্তান", range: "১৯৪৭–১৯৭১", hex: "#3f6f8a", start: 1947 },
  bangladesh: { bn: "স্বাধীন বাংলাদেশ", short: "বাংলাদেশ", range: "১৯৭১–বর্তমান", hex: "#b8324b", start: 1971 },
  india: { bn: "স্বাধীন ভারত", short: "ভারত", range: "১৯৪৭–বর্তমান", hex: "#d97b0e", start: 1947 },
};

const isLegacy = (p?: string): p is LegacyPeriod => !!p && (LEGACY_PERIODS as readonly string[]).includes(p);

/** Any story period, old (fixed key) or new (described by the AI). */
export type PeriodLike = {
  period?: string;
  label_bn?: string;
  range_bn?: string;
  start_year?: number;
  end_year?: number;
};

/**
 * A period/era colour darkened (mixed toward the text colour) until it can be
 * used for small text on the light panel: WCAG AA, 4.5:1 on #fafaf9. Pins and
 * dots keep the original colour; only text uses this. "#a8741a" → "#8e6216".
 */
export function readableText(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const paper = lum([250, 250, 249]);
  const ink = [31, 35, 40];
  const base = rgb(hex);
  if (base.some(Number.isNaN)) return hex;
  for (let t = 0; t <= 1; t += 0.05) {
    const mixed = base.map((v, i) => Math.round(v + (ink[i] - v) * t));
    if ((paper + 0.05) / (lum(mixed) + 0.05) >= 4.6) return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  return "#1f2328";
}

/** Distinct, readable colors for periods, assigned in chronological order. */
const PERIOD_PALETTE = ["#2e7d6b", "#a8741a", "#6b5b95", "#3f6f8a", "#b8324b", "#a0522d", "#5c7a29", "#8e4585", "#2f6f9f"];

/**
 * How to show a period: its name, a short chip label, its years and a color.
 * `index` is its position in the story (chronological), which picks the color
 * for new-style periods so neighbouring periods always differ.
 */
export function periodDisplay(p: PeriodLike, index: number, country?: string) {
  if (!p.label_bn && isLegacy(p.period)) {
    const meta = LEGACY_PERIOD_META[p.period];
    // After 1947 "pakistan" is East Pakistan (1947–71) for Bangladesh, today's Pakistan for Pakistan.
    if (p.period === "pakistan" && country === "PK") return { ...meta, bn: "পাকিস্তান", range: "১৯৪৭–বর্তমান" };
    return meta;
  }
  const bn = p.label_bn?.trim() || "অজানা আমল";
  const words = bn.split(/\s+/);
  const range =
    p.range_bn?.trim() ||
    (p.start_year !== undefined ? `${bnYear(p.start_year)}${p.end_year !== undefined ? `–${bnYear(p.end_year)}` : ""}` : "");
  return {
    bn,
    // Chips are short: the first two words ("রোমান সাম্রাজ্য", "ডাচ ঔপনিবেশিক").
    short: words.length > 2 ? words.slice(0, 2).join(" ") : bn,
    range,
    hex: isLegacy(p.period) ? LEGACY_PERIOD_META[p.period].hex : PERIOD_PALETTE[index % PERIOD_PALETTE.length],
    start: p.start_year ?? (isLegacy(p.period) ? LEGACY_PERIOD_META[p.period].start : Number.MAX_SAFE_INTEGER),
  };
}

/** Chronological order for periods of either style. */
export function periodStart(p: PeriodLike): number {
  return p.start_year ?? (isLegacy(p.period) ? LEGACY_PERIOD_META[p.period].start : Number.MAX_SAFE_INTEGER);
}

const bnDigits = new Intl.NumberFormat("bn-BD", { useGrouping: false });
const bnDecimal = new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 1 });

/** 1678 → "১৬৭৮"; negative years become "খ্রিস্টপূর্ব …". */
export function bnYear(year: number): string {
  return year < 0 ? `খ্রিস্টপূর্ব ${bnDigits.format(-year)}` : bnDigits.format(year);
}

/** Distance in metres → "৮০০ মি" / "২.৪ কিমি". */
export function bnDistance(m: number): string {
  return m < 1000 ? `${bnDigits.format(Math.round(m / 10) * 10)} মি` : `${bnDecimal.format(m / 1000)} কিমি`;
}

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "2 hours ago", "Yesterday", "3 days ago", "12 Nov". */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} ${Math.floor(s / 3600) === 1 ? "hour" : "hours"} ago`;
  if (s < 2 * 86_400) return "Yesterday";
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" });
}

/** "23.7104, 90.4074" (as Google Maps copies it) → { lat, lng }; undefined when it isn't that. */
export function parseLatLng(text: string): { lat: number; lng: number } | undefined {
  const m = text.trim().match(/^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/);
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : undefined;
}
