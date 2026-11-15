/**
 * Reading, checking and writing place content in content/places/<slug>/.
 * Shared by scripts/build-content.ts and the local admin (/admin).
 * Server-side only (uses the file system).
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { imageSizeFromFile } from "image-size/fromFile";
import type { ZodType } from "zod";
import {
  Credits,
  PlaceMeta,
  Sources,
  Story,
  type CreditT,
  type Place,
  type PlaceMetaT,
  type ResolvedImage,
  type SourceT,
  type StoryBlockT,
} from "./schema";

const ROOT = process.cwd();
export const CONTENT_DIR = join(ROOT, "content/places");

/** The raw files of one place, as stored on disk. */
export type PlaceFiles = {
  meta: PlaceMetaT;
  story: StoryBlockT[];
  sources: SourceT[];
  credits: Record<string, CreditT>;
};

const rel = (p: string) => p.replace(ROOT + "/", "");

async function readJson<T>(file: string, schema: ZodType<T>, errors: string[], fallback?: T): Promise<T | undefined> {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    errors.push(`${rel(file)}: missing`);
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    errors.push(`${rel(file)}: invalid JSON (${(e as Error).message})`);
    return undefined;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${rel(file)}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return undefined;
  }
  return parsed.data;
}

export async function listSlugs(): Promise<string[]> {
  if (!existsSync(CONTENT_DIR)) return [];
  return (await readdir(CONTENT_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export async function readPlaceFiles(slug: string, errors: string[] = []): Promise<PlaceFiles | undefined> {
  const base = join(CONTENT_DIR, slug);
  const meta = await readJson(join(base, "place.json"), PlaceMeta, errors);
  const story = await readJson(join(base, "story.json"), Story, errors);
  const sources = await readJson(join(base, "sources.json"), Sources, errors);
  const credits = await readJson(join(base, "images/credits.json"), Credits, errors, {});
  if (!meta || !story || !sources || !credits) return undefined;
  return { meta, story, sources, credits };
}

/** Checks the files against each other: sources cited, images present and credited. */
export function crossCheck(slug: string, files: PlaceFiles): string[] {
  const errors: string[] = [];
  const where = `content/places/${slug}`;
  const { meta, story, sources, credits } = files;
  if (meta.slug !== slug) errors.push(`${where}/place.json: slug "${meta.slug}" must match folder name`);
  const ids = new Set(sources.map((s) => s.id));
  story.forEach((block, i) => {
    for (const id of block.sources) {
      if (!ids.has(id)) errors.push(`${where}/story.json: [${i}] unknown source "${id}"`);
    }
  });
  for (const file of referencedImages(files)) {
    if (!existsSync(join(CONTENT_DIR, slug, "images", file))) {
      errors.push(`${where}/images/${file}: referenced but missing`);
    } else if (!credits[file] && !file.endsWith(".svg")) {
      // Our own SVG stage drawings need no credit; everything else does.
      errors.push(`${where}/images/credits.json: no credit for "${file}"`);
    }
  }
  return errors;
}

export function referencedImages({ meta, story }: Pick<PlaceFiles, "meta" | "story">): Set<string> {
  const files = new Set<string>();
  if (meta.hero) files.add(meta.hero.image);
  for (const b of story) {
    if ((b.kind === "stage" || b.kind === "person") && b.image) files.add(b.image.image);
    if (b.kind === "then_now") files.add(b.then.image).add(b.now.image);
  }
  return files;
}

/**
 * Turns raw files into the Place the app renders. `mediaUrl` decides where
 * images are served from: /media/... on the site, an admin route in preview.
 */
export async function resolvePlace(
  slug: string,
  files: PlaceFiles,
  mediaUrl: (slug: string, file: string) => string = (s, f) => `/media/${s}/${f}`,
): Promise<Place> {
  const images: Record<string, ResolvedImage> = {};
  for (const file of referencedImages(files)) {
    const path = join(CONTENT_DIR, slug, "images", file);
    if (!existsSync(path)) continue;
    const { width = 0, height = 0 } = await imageSizeFromFile(path);
    images[file] = { src: mediaUrl(slug, file), width, height, credit: files.credits[file] };
  }
  return { ...files.meta, story: files.story, sources: files.sources, images };
}

export async function writePlaceFiles(slug: string, files: PlaceFiles): Promise<void> {
  const base = join(CONTENT_DIR, slug);
  await mkdir(join(base, "images"), { recursive: true });
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  await writeFile(join(base, "place.json"), json(PlaceMeta.parse(files.meta)));
  await writeFile(join(base, "story.json"), json(Story.parse(files.story)));
  await writeFile(join(base, "sources.json"), json(Sources.parse(files.sources)));
  await writeFile(join(base, "images/credits.json"), json(Credits.parse(files.credits)));
}

/**
 * Writes what the site needs: src/generated/places.json, public/places.geojson
 * and public/media/. Only published places unless `drafts` is set.
 */
export async function buildContent({ drafts }: { drafts: boolean }) {
  const errors: string[] = [];
  const all: Place[] = [];
  for (const slug of await listSlugs()) {
    const files = await readPlaceFiles(slug, errors);
    if (!files) continue;
    const problems = crossCheck(slug, files);
    errors.push(...problems);
    if (!problems.length) all.push(await resolvePlace(slug, files));
  }
  if (errors.length) return { ok: false as const, errors };

  const places = all
    .filter((p) => drafts || p.status === "published")
    .sort((a, b) => a.name.bn.localeCompare(b.name.bn, "bn"));

  await mkdir(join(ROOT, "src/generated"), { recursive: true });
  await writeFile(join(ROOT, "src/generated/places.json"), JSON.stringify(places, null, 2));
  await writeFile(
    join(ROOT, "public/places.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: places.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.location.lng, p.location.lat] },
        properties: { slug: p.slug, name: p.name.bn, era: p.era, tier: p.tier },
      })),
    }),
  );

  const media = join(ROOT, "public/media");
  await rm(media, { recursive: true, force: true });
  for (const p of places) {
    const files = Object.keys(p.images);
    if (!files.length) continue;
    await mkdir(join(media, p.slug), { recursive: true });
    for (const file of files) await cp(join(CONTENT_DIR, p.slug, "images", file), join(media, p.slug, file));
  }
  return { ok: true as const, built: places.length, skipped: all.length - places.length };
}
