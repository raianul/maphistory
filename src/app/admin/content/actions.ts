"use server";

import { join } from "node:path";
import { buildContent, CONTENT_DIR, crossCheck, readPlaceFiles, writePlaceFiles, type PlaceFiles } from "@/lib/content";
import { checkLicense, downloadImage, findCommonsImages, type CommonsImage } from "@/lib/sources/commons";
import { fetchWikidata } from "@/lib/sources/wiki";

/** The admin edits files on this computer; it must never run on the live site. */
function assertDev() {
  if (process.env.NODE_ENV !== "development") throw new Error("The admin only runs under `pnpm dev`.");
}

export type ActionState = { error?: string; ok?: string };

const extOf = (file: string) => (file.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? "jpg").toLowerCase().replace("jpeg", "jpg");

/** Rebuilds src/generated so the public pages in dev show the change. */
async function rebuild() {
  const r = await buildContent({ drafts: true });
  if (!r.ok) throw new Error(r.errors.join("\n"));
}

async function addImage(slug: string, files: PlaceFiles, img: CommonsImage, hero: boolean): Promise<PlaceFiles> {
  const check = checkLicense(img.credit.license);
  if (!check.allowed) throw new Error(`Can't use "${img.file}": ${check.reason}`);
  const existing = new Set(Object.keys(files.credits));
  let n = 1;
  while (existing.has(`${slug}-${n}.${extOf(img.file)}`)) n++;
  const name = `${slug}-${n}.${extOf(img.file)}`;
  await downloadImage(img, join(CONTENT_DIR, slug, "images"), name);
  const next: PlaceFiles = { ...files, credits: { ...files.credits, [name]: img.credit } };
  if (hero) next.meta = { ...files.meta, hero: { image: name, alt: { bn: files.meta.name.bn, en: files.meta.name.en } } };
  return next;
}

export async function savePlace(slug: string, files: PlaceFiles): Promise<ActionState> {
  assertDev();
  try {
    const problems = crossCheck(slug, files);
    if (problems.length) return { error: problems.join("\n") };
    await writePlaceFiles(slug, files);
    await rebuild();
    return { ok: "সংরক্ষিত হয়েছে" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function findPhotos(slug: string): Promise<{ images?: CommonsImage[]; error?: string }> {
  assertDev();
  try {
    const files = await readPlaceFiles(slug);
    if (!files) return { error: "Place files are invalid." };
    const qid = files.sources.find((s) => s.id === "wikidata")?.url.match(/Q\d+$/)?.[0];
    const wd = qid ? await fetchWikidata(qid) : undefined;
    const images = await findCommonsImages({
      mainImage: wd?.image,
      category: wd?.commonsCategory,
      search: files.meta.name.en ?? files.meta.name.bn,
      limit: 30,
    });
    return { images };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Downloads a picked photo, adds its credit and saves the editor's current state with it. */
export async function addPhoto(
  slug: string,
  files: PlaceFiles,
  img: CommonsImage,
  hero: boolean,
): Promise<ActionState & { files?: PlaceFiles }> {
  assertDev();
  try {
    const next = await addImage(slug, files, img, hero);
    const problems = crossCheck(slug, next);
    if (problems.length) return { error: problems.join("\n") };
    await writePlaceFiles(slug, next);
    await rebuild();
    return { ok: hero ? "প্রধান ছবি বদলানো হয়েছে" : "ছবি যোগ হয়েছে", files: next };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
