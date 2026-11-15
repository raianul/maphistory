import { z } from "zod";

/**
 * Content schema for one place. Each place lives in content/places/<slug>/
 * and is checked against these schemas by scripts/build-content.ts.
 *
 * The shape mirrors the future Supabase tables (landmarks, story_blocks,
 * media, sources), so moving to a database in phase 2 is a script.
 */

/** Ordered: before 1204, 1204–1576, 1576–1757, 1757–1947, 1947–1971, 1971 onwards. */
export const ERAS = ["ancient", "sultanate", "mughal", "british", "pakistan", "bangladesh"] as const;
export const TIERS = ["standard", "featured"] as const;
export const STATUSES = ["draft", "review", "published"] as const;

/** Bangla is required; English is shown when present. */
export const Text = z.object({
  bn: z.string().min(1),
  en: z.string().min(1).optional(),
});

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase-with-dashes");
const Year = z.number().int().min(-3000).max(2100);
const ImageFile = z.string().regex(/^[\w.-]+\.(jpe?g|png|webp|svg)$/i, "image file name");

export const PlaceMeta = z.object({
  slug: Slug,
  name: Text,
  summary: Text,
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  city: Text,
  country: z.string().length(2),
  era: z.enum(ERAS),
  built: z.object({
    start: Year,
    end: Year.nullable().optional(),
    note: Text.optional(),
  }),
  tier: z.enum(TIERS),
  status: z.enum(STATUSES),
  hero: z.object({ image: ImageFile, alt: Text }).optional(),
  keyNumbers: z.array(z.object({ value: Text, label: Text })).max(4).optional(),
});

const SourceIds = z.array(z.string()).min(1, "every block needs at least one source");

/**
 * For AI drafts: a short verbatim quote from the source that supports the
 * block, and whether it was actually found in the source text. Shown in the
 * admin only, so the reviewer knows which claims to check first.
 */
const Evidence = z.object({ quote: z.string(), found: z.boolean() });

const BlockBase = {
  title: Text,
  body: Text.optional(),
  sources: SourceIds,
  evidence: Evidence.optional(),
};

const Illustration = z.object({ image: ImageFile, alt: Text });

export const StoryBlock = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stage"), year: Year.optional(), image: Illustration.optional(), ...BlockBase }),
  z.object({ kind: z.literal("event"), year: Year, ...BlockBase }),
  z.object({ kind: z.literal("fact"), ...BlockBase }),
  z.object({
    kind: z.literal("person"),
    lived: z.object({ from: Year.optional(), to: Year.optional() }).optional(),
    image: Illustration.optional(),
    ...BlockBase,
  }),
  z.object({
    kind: z.literal("then_now"),
    then: Illustration.extend({ year: Year.optional() }),
    now: Illustration.extend({ year: Year.optional() }),
    ...BlockBase,
  }),
]);

export const Story = z.array(StoryBlock);

export const Source = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url(),
  accessed: z.iso.date(),
});

export const Sources = z.array(Source).min(1);

export const Credit = z.object({
  /** File name on Wikimedia Commons (or another source). */
  title: z.string().optional(),
  author: z.string().min(1),
  license: z.string().min(1),
  licenseUrl: z.url().optional(),
  sourceUrl: z.url(),
  /** Set when we changed the image (cropped, edited), as CC licences require. */
  modified: z.string().optional(),
});

export const Credits = z.record(ImageFile, Credit);

export type Era = (typeof ERAS)[number];
export type TextT = z.infer<typeof Text>;
export type PlaceMetaT = z.infer<typeof PlaceMeta>;
export type StoryBlockT = z.infer<typeof StoryBlock>;
export type SourceT = z.infer<typeof Source>;
export type CreditT = z.infer<typeof Credit>;

/** An image after the build step: served path, size and credit. */
export type ResolvedImage = {
  src: string;
  width: number;
  height: number;
  credit?: CreditT;
};

/** One place as the app sees it, produced by scripts/build-content.ts. */
export type Place = PlaceMetaT & {
  story: StoryBlockT[];
  sources: SourceT[];
  images: Record<string, ResolvedImage>;
};
