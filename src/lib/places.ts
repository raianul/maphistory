import data from "../generated/places.json";
import { bnYear } from "./format";
import type { Place, TextT } from "./schema";
import { SITE_URL } from "./site";

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

export const SITE = {
  name: "Place & Past",
  /** Shown beside the name; kept so callers that show both still work. */
  nameEn: "Place & Past",
  tagline: "Every Place Has a Past.",
  /** The address without https://, as shown on the About and Privacy pages. */
  domain: SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  url: SITE_URL,
  reportFormUrl: process.env.NEXT_PUBLIC_REPORT_FORM_URL,
};
