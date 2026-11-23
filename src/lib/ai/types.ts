// Client-safe types for the live AI story (type-only imports are erased from the bundle).
import type { CreditT } from "../schema";
import type { PlaceVideo } from "../video";
import type { AiStoryDataT } from "./place-story";

export type { AiStoryDataT };

export type AiPlace = {
  story: AiStoryDataT;
  image?: { src: string; credit: CreditT };
  model: string;
  /** Set once saved in the database. */
  id?: string;
  /** The place's page address (/place/<slug>), once saved. */
  slug?: string;
  /** "ai" until the admin checks it, then "verified". */
  status?: "ai" | "verified" | "hidden";
  /** When the admin verified it (ISO), for verified stories. */
  verifiedAt?: string;
  /** Historical videos about this place, main one first (saved places only; separate from the story). */
  videos?: PlaceVideo[];
};

type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** A story still being streamed: any field may be missing or half-written. */
export type PartialStory = DeepPartial<AiStoryDataT>;
