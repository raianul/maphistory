/**
 * Writes a place's story with Gemini and finds its photo. Used by the visitor
 * route (streamed, via onDelta/onImage) and by the admin's "regenerate".
 * Server-side only.
 */
import { parsePartialJson } from "../partial-json";
import { findPlacePhoto, type Photo, type PhotoHints } from "../sources/place-photo";
import { AiStoryData, STORY_SCHEMA_VERSION, streamStory, type StoryTarget } from "./place-story";
import type { AiPlace } from "./types";

/** Resolves after `ms` with undefined, so a slow photo search can't hold up the finished story. */
const timeout = (ms: number) => new Promise<undefined>((r) => setTimeout(() => r(undefined), ms));

export async function generatePlace(
  target: StoryTarget,
  {
    signal,
    onDelta,
    onImage,
  }: {
    signal?: AbortSignal;
    /** Each new piece of the story JSON, as Gemini writes it. */
    onDelta?: (text: string) => void;
    /** The photo, as soon as it is found (usually before the text is done). */
    onImage?: (image: NonNullable<AiPlace["image"]>) => void;
  } = {},
): Promise<AiPlace> {
  // The photo search starts right away (Wikidata and nearby photos need only the name and
  // location); its later steps wait for the AI's English name and photo phrase.
  let giveHints: (h: PhotoHints) => void = () => {};
  const hints = new Promise<PhotoHints>((r) => (giveHints = r));
  let hinted = false;
  const photo: Promise<Photo | undefined> = findPlacePhoto(target, hints)
    .catch(() => undefined)
    .then((img) => {
      if (img) onImage?.({ src: img.src, credit: img.credit });
      return img;
    });

  try {
    let text = "";
    const gen = streamStory(target, signal);
    let step = await gen.next();
    while (!step.done) {
      text += step.value;
      onDelta?.(step.value);
      // Once "kind_bn" has begun, the English name and photo phrase before it are complete.
      if (!hinted && text.includes('"kind_bn"')) {
        const partial = parsePartialJson<{ name_en?: string; photo_query_en?: string }>(text);
        hinted = true;
        giveHints({ nameEn: partial?.name_en, query: partial?.photo_query_en });
      }
      step = await gen.next();
    }
    const story = AiStoryData.parse(JSON.parse(text));
    if (!hinted) giveHints({ nameEn: story.name_en, query: story.photo_query_en });
    // Facts we know better than the model: the format version, how it was made, and the
    // country from the coordinates (the model's answer is only a fallback).
    story.schema_version = STORY_SCHEMA_VERSION;
    story.provenance = { method: "model_knowledge", model: step.value, generated_at: new Date().toISOString() };
    if (target.context?.countryCode && /^[A-Z]{2}$/.test(target.context.countryCode)) story.country = target.context.countryCode;
    const image = await Promise.race([photo, timeout(6000)]);
    return { story, model: step.value, image: image && { src: image.src, credit: image.credit } };
  } finally {
    // If the story failed midway, let the photo search finish instead of waiting forever.
    giveHints({});
  }
}

export function friendlyError(e: unknown): string {
  const msg = (e as Error).message ?? String(e);
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(msg)) return "AI-এর ফ্রি সীমা আপাতত শেষ। একটু পরে আবার চেষ্টা করুন।";
  if (/UNAVAILABLE|503|high demand/i.test(msg)) return "AI এই মুহূর্তে ব্যস্ত। কয়েক সেকেন্ড পরে আবার ক্লিক করুন।";
  return msg;
}
