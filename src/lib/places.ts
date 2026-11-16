import data from "@/generated/places.json";
import { bnYear } from "./format";
import type { Place, TextT } from "./schema";

export { ERA_META, bnYear } from "./format";

// Written by scripts/build-content.ts, which has already validated it.
const places = data as unknown as Place[];

export function getPlaces(): Place[] {
  return places;
}

export function getPlace(slug: string): Place | undefined {
  return places.find((p) => p.slug === slug);
}

export function builtLabel(p: Place): string {
  const { start, end, note } = p.built;
  const range = end ? `${bnYear(start)}–${bnYear(end)}` : bnYear(start);
  return note ? `${range} · ${note.bn}` : range;
}

export function t(text: TextT | undefined): string {
  return text?.bn ?? "";
}

/**
 * The site's public address. Set NEXT_PUBLIC_SITE_URL once the domain (ondor.site) is connected;
 * until then, on Vercel, the project's own production address (e.g. ondor.vercel.app), which
 * Vercel provides; locally, localhost.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "http://localhost:3000";

export const SITE = {
  name: "Ondor",
  /** Shown beside the name; kept so callers that show both still work. */
  nameEn: "Ondor",
  tagline: "Every Place Has a Past.",
  /** The address without https://, as shown on the About and Privacy pages. */
  domain: SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  url: SITE_URL,
  reportFormUrl: process.env.NEXT_PUBLIC_REPORT_FORM_URL,
};
