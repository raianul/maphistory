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

export const SITE = {
  name: "জায়গার গল্প",
  nameEn: "Jaygar Golpo",
  tagline: "প্রতিটি জায়গার পেছনের গল্প",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://jaygargolpo.com",
  reportFormUrl: process.env.NEXT_PUBLIC_REPORT_FORM_URL,
};
