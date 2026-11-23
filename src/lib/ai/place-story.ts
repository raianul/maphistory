/**
 * The story of any place in the world, written by Gemini from its own
 * knowledge (no sources are fetched yet), returned as JSON so the panel can
 * lay it out, and streamed as it is written. Every item carries the model's
 * confidence and the kind of evidence it rests on; stories stay labelled
 * unverified until an editor checks them. Server-side only.
 *
 * Story format versions (both are read; only v2 is written):
 *   v1  periods keyed by fixed South Asian periods ("mughal", "british" …),
 *       country limited to BD/IN/PK, era from a fixed South Asian list.
 *   v2  periods described by the AI to fit the place (label_bn, range_bn,
 *       start_year …), any ISO country, era_label_bn, evidence levels,
 *       historical names and debates. `sources` and `provenance` exist for
 *       future source retrieval; the AI is never asked to produce sources.
 */
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { LEGACY_PERIODS } from "../format";
import { ERAS } from "../schema";
import { describeContext, type PlaceContext } from "../sources/reverse-geocode";
import { FALLBACK_MODEL, GEMINI_MODEL } from "./model";

export const STORY_SCHEMA_VERSION = 2;

export type StoryTarget = {
  name: string;
  lat: number;
  lng: number;
  /** What the base map says it is, e.g. "suburb", "place_of_worship", "road or street (secondary)". */
  kind?: string;
  /** Other labels drawn around it, to tell same-named places apart. */
  nearby?: string[];
  /** Country, region and city from the coordinates (reverse geocoding), when known. */
  context?: PlaceContext;
};

const SYSTEM_PROMPT = `You are an expert world historian, a careful regional historical researcher and a skilled Bangla
documentary storyteller. You write for "জায়গার গল্প", a Bangla-first historical discovery map of the
whole world: someone has just tapped a place, anywhere on Earth, and wants to understand its history
in under two minutes on their phone.

WHICH PLACE
Write about EXACTLY the place given. Use the coordinates, the location context and the nearby map
labels to be sure which one: many places share names. Not a building or institution that merely
shares its name. The map category decides what kind of place it is: for a city, town, district,
area or neighbourhood tell THAT place's story (how it began, who lived there, how it changed),
never only the story of its most famous monument; famous sites inside it go in "places_here".

PERIODS THAT FIT THE PLACE
Tell the story period by period, but the periods must come from THIS place's own political,
cultural and settlement history. There is no universal timeline. For example (illustrations only):
Dhaka: early settlements, Sultanate, Mughal, Nawabi and British, Pakistan, Bangladesh.
Rome: Roman Kingdom, Republic, Empire, Late Antiquity, medieval and Papal Rome, modern Italy.
Moscow: early Slavic and Rus, Principality of Moscow, Tsardom, Russian Empire, Soviet Union,
Russian Federation. New York: Lenape homeland, Dutch colony, British colony, Revolution,
industry and immigration, modern city.
- Name each period as people of that place would recognise it, in Bangla ("label_bn"), with its
  years ("range_bn", "start_year", "end_year"; negative years for BCE).
- Use the political identity that applied AT THE TIME: do not project today's country or borders
  backwards (Constantinople under the Byzantines, not "Turkey"; Bengal under the Mughals, not
  "Bangladesh").
- Include ONLY periods with real, specific information about this place, in chronological order.
  Never fill a period with generic national history; if nothing reliable is known locally, omit it.
- Each period opens with "intro_bn": one or two sentences on what this place was like then.

WHOSE HISTORY
- Do not begin with colonial rule or with today's country when earlier peoples, settlements or
  civilisations are known: include Indigenous peoples, early settlement and migration where there
  is evidence.
- Include ordinary people, not only rulers and wars: traders and merchants, artisans and crafts,
  farmers and workers, religious and cultural communities, migrants, markets and daily life.

KINDS OF PLACE
- Roads and streets: the NAME first. Who or what it commemorates (that person briefly in "people",
  in their period), original and earlier names and when it was renamed ("historical_names",
  "name_story_bn", events), why it mattered, notable places along it ("places_here").
- Neighbourhoods: first settlement, name origin, communities, markets and occupations, how it changed.
- Markets: origins, trading communities, goods, trade networks, economic and social role.
- Monuments and buildings: who built it and for whom, architecture, original purpose, later uses
  and transformations.
- Rivers and waterways: changes of course and landscape, trade and transport, settlements,
  economic and cultural importance, environmental change.
- Mountains, islands, lakes and other natural features: historical significance, Indigenous and
  local communities, trade, migration, settlement and cultural meaning.
- Archaeological sites: who lived there, what was found, how it is dated, what it tells us.

EVIDENCE AND HONESTY
- You are writing from your own knowledge. Nothing has been checked against sources for this
  answer: never claim it has, and never invent sources, citations, URLs or quotations.
- Never invent names, dates, numbers or historical figures. Leaving something out is better than
  guessing. If little is known, keep the story short and say so in "uncertain_bn".
- For each item give "evidence_level": "documented" (records, inscriptions, archaeology),
  "scholarly" (an academic interpretation or reconstruction), "tradition" (oral or local tradition),
  "legend", or "disputed". And a separate "confidence" in your own statement: "high", "medium" or
  "low". A well-known legend can be high confidence AS a legend.
- When historians disagree, present the competing explanations fairly in "historical_debates";
  do not pick one silently.
- Use approximate periods ("১৭শ শতক", "মুঘল আমলে") when exact years are uncertain.
- Accuracy and local relevance always come before drama.

STYLE
Natural modern standard Bangla (চলিত ভাষা): warm, vivid but factual, no exaggeration. Bangla digits
in Bangla text. Foreign names in their usual Bangla spelling. Titles 2–6 words; bodies 1–2 short
sentences. Keep the whole story readable in under two minutes: 3–6 periods for most places, fewer
for small or recent ones.`;

const EVIDENCE_LEVELS = ["documented", "scholarly", "tradition", "legend", "disputed"] as const;

const item = (extra: Record<string, unknown>, required: string[]) => ({
  type: "object",
  properties: {
    ...extra,
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    evidence_level: { type: "string", enum: [...EVIDENCE_LEVELS] },
  },
  required: [...required, "confidence"],
});

/**
 * What Gemini must return (v2). Field order matters: the name and photo phrase
 * come first so the photo search can start while the rest is written.
 */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name_bn: { type: "string" },
    name_en: { type: "string" },
    photo_query_en: {
      type: "string",
      description:
        "English Wikimedia Commons search phrase for the photo that best shows this place, naming the place and its most telling landmark or view, e.g. 'Saidpur railway workshop', 'Colosseum Rome exterior'",
    },
    country: { type: "string", description: "ISO 3166-1 alpha-2 code of the country the place is in today, uppercase, e.g. BD, IT, RU, US" },
    locality_en: {
      type: "string",
      description:
        "Where it is, in English, for a map search: town or city, then state, province or region, then country, e.g. 'Agra, Uttar Pradesh, India', 'Rome, Lazio, Italy'",
    },
    kind_bn: { type: "string", description: "e.g. এলাকা, সড়ক, নদী, বাজার, মসজিদ, গির্জা, দুর্গ, প্রাসাদ, পাহাড়, দ্বীপ, প্রত্নস্থল" },
    historical_names: {
      type: "array",
      maxItems: 4,
      description: "Earlier names of this place, only if known (e.g. Byzantion → Constantinople → Istanbul)",
      items: { type: "object", properties: { name: { type: "string" }, when_bn: { type: "string" } }, required: ["name"] },
    },
    era_label_bn: { type: "string", description: "The period it is best known for, in Bangla, e.g. মুঘল আমল, রোমান সাম্রাজ্য; omit for recent places" },
    origin_bn: { type: "string", description: "When it began, e.g. ১৬৭৮, খ্রিস্টপূর্ব ৮ম শতক" },
    summary_bn: { type: "string", description: "2–3 sentences: what it is and why it matters" },
    name_story_bn: { type: "string", description: "Where the name comes from, if known" },
    historical_significance_bn: { type: "string", description: "One or two sentences on its wider historical importance, only if it has some" },
    key_numbers: {
      type: "array",
      maxItems: 4,
      items: { type: "object", properties: { value_bn: { type: "string" }, label_bn: { type: "string" } }, required: ["value_bn", "label_bn"] },
    },
    periods: {
      type: "array",
      description: "This place's own historical periods, only those with real local content, in chronological order",
      items: {
        type: "object",
        properties: {
          label_bn: { type: "string", description: "Period name as it applies to this place, in Bangla, e.g. মুঘল আমল, রোমান প্রজাতন্ত্র, ডাচ ঔপনিবেশিক যুগ" },
          range_bn: { type: "string", description: "Its years in Bangla, e.g. ১৫৭৬–১৭৫৭, খ্রিস্টপূর্ব ৫০৯–২৭" },
          start_year: { type: "integer", description: "Start year for ordering, negative for BCE" },
          end_year: { type: "integer", description: "End year; omit if it continues today" },
          intro_bn: { type: "string", description: "1–2 sentences: what this place was like in this period" },
          events: {
            type: "array",
            maxItems: 4,
            items: item(
              {
                when_bn: { type: "string", description: "e.g. ১৬৭৮ or ১৮শ শতকের শেষে" },
                sort_year: { type: "integer", description: "Approximate year for ordering" },
                title_bn: { type: "string" },
                body_bn: { type: "string" },
              },
              ["when_bn", "sort_year", "title_bn", "body_bn"],
            ),
          },
          people: {
            type: "array",
            maxItems: 3,
            items: item({ name_bn: { type: "string" }, role_bn: { type: "string" }, body_bn: { type: "string" } }, ["name_bn", "role_bn", "body_bn"]),
          },
          facts: {
            type: "array",
            maxItems: 3,
            items: item({ title_bn: { type: "string" }, body_bn: { type: "string" } }, ["title_bn", "body_bn"]),
          },
        },
        required: ["label_bn", "start_year", "intro_bn"],
      },
    },
    places_here: {
      type: "array",
      description: "For areas: notable places inside it. For roads: notable places along it",
      maxItems: 6,
      items: { type: "object", properties: { name_bn: { type: "string" }, what_bn: { type: "string" } }, required: ["name_bn", "what_bn"] },
    },
    historical_debates: {
      type: "array",
      maxItems: 2,
      description: "Only real disagreements among historians: the question and the competing explanations",
      items: {
        type: "object",
        properties: { question_bn: { type: "string" }, views_bn: { type: "array", items: { type: "string" }, maxItems: 3 } },
        required: ["question_bn", "views_bn"],
      },
    },
    uncertain_bn: { type: "string", description: "What is unclear or unknown, if anything" },
  },
  required: ["name_bn", "name_en", "photo_query_en", "country", "locality_en", "kind_bn", "summary_bn", "periods"],
};

const Confidence = z.enum(["high", "medium", "low"]);
/** Optional extras are tolerant: an unexpected value is dropped rather than failing the whole story. */
const EvidenceLevel = z.enum(EVIDENCE_LEVELS).optional().catch(undefined);
const Item = { confidence: Confidence, evidence_level: EvidenceLevel };

/** "BD", "it" → "IT"; anything that isn't a 2-letter code becomes undefined. */
const CountryCode = z
  .string()
  .optional()
  .catch(undefined)
  .transform((v) => (v && /^[A-Za-z]{2}$/.test(v.trim()) ? v.trim().toUpperCase() : undefined));

/** A period's fields (without the label-or-key rule), exported so tests can compare with RESPONSE_SCHEMA. */
export const StoryPeriodFields = z.object({
    /** v1 only: a fixed South Asian period key. */
    period: z.enum(LEGACY_PERIODS).optional(),
    /** v2: the period as it applies to this place. */
    label_bn: z.string().optional(),
    range_bn: z.string().optional(),
    start_year: z.number().optional(),
    end_year: z.number().optional(),
    intro_bn: z.string(),
    events: z.array(z.object({ when_bn: z.string(), sort_year: z.number(), title_bn: z.string(), body_bn: z.string(), ...Item })).optional(),
    people: z.array(z.object({ name_bn: z.string(), role_bn: z.string(), body_bn: z.string(), ...Item })).optional(),
    facts: z.array(z.object({ title_bn: z.string(), body_bn: z.string(), ...Item })).optional(),
});

export const StoryPeriod = StoryPeriodFields.refine((p) => !!p.period || !!p.label_bn?.trim(), {
  message: "a period needs label_bn (or a v1 period key)",
});

/** A source behind the story. Not produced by the AI: filled only by real source retrieval or an editor. */
export const StorySource = z.object({
  title: z.string(),
  author_or_institution: z.string().optional(),
  year: z.number().optional(),
  type: z.enum(["primary", "academic", "institutional", "oral_tradition", "reference"]),
  url: z.url().optional(),
});

export const AiStoryData = z.object({
  /** 2 for stories written by this engine; missing on v1 stories. */
  schema_version: z.number().optional(),
  name_bn: z.string(),
  name_en: z.string(),
  photo_query_en: z.string().optional(),
  country: CountryCode,
  locality_en: z.string().optional(),
  kind_bn: z.string(),
  historical_names: z.array(z.object({ name: z.string(), when_bn: z.string().optional() })).optional().catch(undefined),
  /** v1 only: fixed South Asian era. */
  era: z.enum(ERAS).optional().catch(undefined),
  /** v2: the period it is best known for, in Bangla. */
  era_label_bn: z.string().optional(),
  origin_bn: z.string().optional(),
  summary_bn: z.string(),
  name_story_bn: z.string().optional(),
  historical_significance_bn: z.string().optional(),
  key_numbers: z.array(z.object({ value_bn: z.string(), label_bn: z.string() })).optional(),
  periods: z.array(StoryPeriod),
  places_here: z.array(z.object({ name_bn: z.string(), what_bn: z.string() })).optional(),
  historical_debates: z.array(z.object({ question_bn: z.string(), views_bn: z.array(z.string()) })).optional().catch(undefined),
  uncertain_bn: z.string().optional(),
  /** Real sources, checked by an editor (never filled by the AI itself). */
  sources: z.array(StorySource).optional(),
  /** Dates an editor checked against the sources, oldest first: "১৯৫৯" → "…". */
  key_dates: z.array(z.object({ date_bn: z.string(), text_bn: z.string() })).optional(),
  /** The editor's note on what was corrected in the AI's draft. */
  corrections_bn: z.string().optional(),
  /** How the story was made, so the UI never claims more than happened. */
  provenance: z
    .object({
      method: z.enum(["model_knowledge", "retrieved_sources", "editor"]),
      model: z.string().optional(),
      generated_at: z.string().optional(),
    })
    .optional(),
});

export type AiStoryDataT = z.infer<typeof AiStoryData>;

/** The message for one place: name, category, coordinates, real location context, nearby labels. */
export function storyPrompt(t: StoryTarget): string {
  const where = describeContext(t.context);
  return [
    `Tell the history of this place.`,
    ``,
    `Name on the map: ${t.name}`,
    t.kind ? `Map category: ${t.kind} (write about a place of this kind)` : "",
    `Coordinates: ${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`,
    where ? `Location (from the coordinates): ${where}` : "",
    t.nearby?.length ? `Nearby map labels: ${t.nearby.join(", ")}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Streams the story as Gemini writes it: yields JSON text pieces, so the
 * panel can show the answer while it is still being written (like ChatGPT).
 * Minimal thinking, because the first words matter more than depth here.
 */
export async function* streamStory(t: StoryTarget, signal?: AbortSignal): AsyncGenerator<string, string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it to .env.local and restart `pnpm dev`.");
  const ai = new GoogleGenAI({ apiKey });
  const start = (model: string) =>
    ai.models.generateContentStream({
      model,
      contents: storyPrompt(t),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal: signal,
      },
    });

  let model = GEMINI_MODEL;
  let stream;
  try {
    stream = await start(model);
  } catch (e) {
    // The free tier is sometimes overloaded (503) or out of today's quota for the main model (429);
    // the lighter model has its own capacity and quota: try it once.
    if (!/UNAVAILABLE|503|high demand|RESOURCE_EXHAUSTED|429|quota/i.test(String(e)) || model === FALLBACK_MODEL) throw e;
    model = FALLBACK_MODEL;
    stream = await start(model);
  }
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
  return model;
}
