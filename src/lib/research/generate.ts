/**
 * "Generate draft": from one chosen "On this day" suggestion to a complete DRAFT event that the
 * public timeline can play, in one step. Reuses the research engine:
 *
 *   1. Material: the suggestion's own source page (fetched SSRF-safe) + English and Bangla
 *      Wikipedia for the event. Saved as a research run (private), like any research.
 *   2. Gemini writes the report (summary, background, phases, steps) citing exact quotes;
 *      validate.ts checks every quote against the retrieved text and drops anything not allowed.
 *   3. Places: each step's place name is looked up on the map (OpenStreetMap, inside the map's
 *      region). Found → a pin marked "approximate"; not found → text only, no pin. The AI never
 *      gives coordinates.
 *   4. Saved as a draft event (recurring on that day): sources attached, steps linked to the
 *      sources their quotes were found in. Nothing is verified and nothing is published: the
 *      admin reviews and publishes (lib/events/publish.ts).
 * Server-side only.
 */
import { createEvent, getEvent, setPhases, addSource, addStep } from "../events/db";
import { EventFields, PHASE_COLORS, StepFields, type PhaseT, type SourceFieldsT } from "../events/schema";
import { db } from "../db";
import { BANGLADESH_ONLY, inRegion } from "../region";
import { WIKI_HEADERS } from "../sources/wiki";
import { analyse as realAnalyse, researchPrompt } from "./analyse";
import type { Candidate, CountryCode } from "./discover";
import { safeFetch } from "./fetch";
import { RESEARCH_PER_DAY } from "./run";
import { collectMaterial, EXCERPT_CHARS, wikipediaFromUrl, type NetDeps } from "./sources";
import { SUGGESTED_PUBLIC_EVIDENCE, type ResearchReport, type ResearchSource } from "./types";
import { validateReport } from "./validate";

type Place = { name: string; lat: number; lng: number };
export type GenerateDeps = NetDeps & {
  analyse?: typeof realAnalyse;
  wikidata?: Parameters<typeof collectMaterial>[1] extends infer D ? (D extends { wikidata?: infer W } ? W : never) : never;
  /** Place lookup (tests pass a fake). Returns the best match inside the map's region, or null. */
  geocode?: (name: string) => Promise<Place | null>;
};

export type GenerateInput = { day: number; month: number; country: CountryCode; candidate: Omit<Candidate, "check"> & { check?: Candidate["check"] } };
export type GenerateProgress = { type: "stage"; message: string } | { type: "done"; event_id: string; warnings: string[] } | { type: "error"; message: string };

/** Places the AI says are outside the country (it is asked to end each place with the country). */
const ABROAD = /\b(india|pakistan|myanmar|burma|nepal|bhutan|china|sri lanka|united kingdom|england|london|usa|united states|france|paris|west bengal|kolkata|calcutta|assam|tripura|karachi|lahore|delhi|bihar)\b|ভারত|পাকিস্তান|মিয়ানমার|পশ্চিমবঙ্গ|কলকাতা|কলিকাতা|আসাম|ত্রিপুরা|করাচি|লাহোর|দিল্লি|লন্ডন/i;

/** Whether a place name (as the AI wrote it) is outside Bangladesh, so it must never get a pin here. */
export const isAbroad = (name: string) => ABROAD.test(name);

/**
 * The best OpenStreetMap match for a place name inside the map's region (Bangladesh), or null.
 * Places named as abroad are never looked up (a same-named village in Bangladesh would be wrong).
 * The free search service is flaky: each query is tried twice.
 */
/**
 * Place lookup on OpenStreetMap's Nominatim, limited to the map's region. Its usage policy allows at
 * most one request per second with an identifying User-Agent: calls are spaced out. Several results
 * come back with their English and local names, so the right one can be chosen.
 */
type OsmHit = { lat: string; lon: string; name?: string; display_name: string; addresstype: string; namedetails?: Record<string, string> };
let nominatimNext = 0;
async function nominatim(q: string): Promise<OsmHit[]> {
  const wait = nominatimNext - Date.now();
  nominatimNext = Math.max(Date.now(), nominatimNext) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "8", namedetails: "1" });
  if (BANGLADESH_ONLY) params.set("countrycodes", "bd");
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as OsmHit[];
}

/** Spelling variants between the AI's English and OpenStreetMap. */
const ALIASES: [RegExp, string][] = [
  [/\bchittagong\b/g, "chattogram"],
  [/\bcomilla\b/g, "cumilla"],
  [/\bbarisal\b/g, "barishal"],
  [/\bjessore\b/g, "jashore"],
  [/\bbogra\b/g, "bogura"],
];
const simple = (s: string) => {
  let t = s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  for (const [re, to] of ALIASES) t = t.replace(re, to);
  return ` ${t} `;
};
/** Centres of the cities/districts the AI most often names (lat, lng), to keep a pin near its town. */
const CITY_CENTRES: Record<string, [number, number]> = {
  dhaka: [23.78, 90.4], chattogram: [22.34, 91.83], khulna: [22.82, 89.55], rajshahi: [24.37, 88.6], sylhet: [24.9, 91.87], barishal: [22.7, 90.37], rangpur: [25.75, 89.25],
  mymensingh: [24.75, 90.41], cumilla: [23.46, 91.18], jashore: [23.17, 89.21], bogura: [24.85, 89.37], habiganj: [24.38, 91.41], narayanganj: [23.62, 90.5], gazipur: [24.0, 90.42],
  tangail: [24.25, 89.92], faridpur: [23.6, 89.84], dinajpur: [25.63, 88.64], pabna: [24.0, 89.24], kushtia: [23.9, 89.12], noakhali: [22.87, 91.1], feni: [23.01, 91.4],
  "cox bazar": [21.45, 92.0], gopalganj: [23.0, 89.82], sirajganj: [24.45, 89.7], rangamati: [22.65, 92.18], brahmanbaria: [23.96, 91.11], moulvibazar: [24.48, 91.77], sunamganj: [25.07, 91.4],
};
const km = (a: number, b: number, c: number, d: number) => {
  const r = Math.PI / 180;
  const x = (d - b) * r * Math.cos(((a + c) / 2) * r);
  const y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
const STOP = new Set(["the", "of", "and", "district", "upazila", "union", "bangladesh"]);
const keyWords = (s: string) => simple(s).trim().split(" ").filter((w) => w.length > 1 && !STOP.has(w));

/**
 * The best hit for a place name: one whose English name contains every distinctive word asked for,
 * as whole words ("Dhaka Medical College" never becomes "Green Life Medical College", and
 * "Bangla Academy" never "Bangla Academy Pond" when the academy itself is listed). Hits whose
 * names are only in Bangla can't be checked and are not used.
 */
function pick(asked: string, hits: OsmHit[], district?: string): Place | null {
  const want = keyWords(asked);
  if (!want.length) return null;
  const phrase = ` ${want.join(" ")} `;
  const inDistrict = district ? keyWords(district) : [];
  const scored = hits
    .map((h, rank) => {
      const lat = Number(h.lat);
      const lng = Number(h.lon);
      const names = [h.namedetails?.["name:en"], h.name, h.namedetails?.int_name, h.namedetails?.alt_name, h.namedetails?.old_name].filter((n): n is string => !!n && /[a-z]/i.test(n));
      // The asked words as one phrase ("dhaka medical college", not "dhaka central … medical college").
      const best = names.map((n) => simple(n).replace(/ (?:the|of|and) /g, " ")).find((n) => n.includes(phrase));
      if (!best || !inRegion(lat, lng)) return null;
      const extra = best.trim().split(" ").length - want.length; // "bangla academy" beats "bangla academy pond"
      // The named district first. Addresses are often in Bangla only; those can't be compared, so
      // they count as neither here nor elsewhere.
      const where = simple(h.display_name);
      const comparable = /[a-z]{3}/i.test(h.display_name);
      // Near the named city's centre (≤ 40 km) when it is a known one: an address may name Dhaka
      // only as the division ("… মানিকগঞ্জ জেলা, ঢাকা বিভাগ").
      const centre = district ? CITY_CENTRES[keyWords(district).filter((w) => w !== "district").join(" ")] : undefined;
      const elsewhere = centre ? (km(lat, lng, centre[0], centre[1]) <= 40 ? 0 : 1) : !inDistrict.length || !comparable ? 0 : inDistrict.every((w) => where.includes(` ${w} `)) ? 0 : 1;
      return { place: { name: h.namedetails?.["name:bn"] ?? h.name ?? h.display_name.split(",")[0], lat, lng }, score: elsewhere * 100 + extra * 10 + rank };
    })
    .filter((x): x is { place: Place; score: number } => !!x && x.score < 100)
    .sort((a, b) => a.score - b.score);
  return scored[0]?.place ?? null;
}

/**
 * The best OpenStreetMap match for a place name inside the map's region (Bangladesh), or null.
 * Places named as abroad are never looked up (a same-named village in Bangladesh would be wrong),
 * and a place is never replaced by its district (a step "at X" pinned mid-district would mislead).
 */
/** The Bangla name a hit is known by (its own name, or name:bn). */
const bnNames = (h: OsmHit) => [h.name, h.namedetails?.name, h.namedetails?.["name:bn"], h.namedetails?.alt_name].filter((n): n is string => !!n && /[\u0980-\u09ff]/.test(n));
const bnSimple = (s: string) => s.normalize("NFC").replace(/[\s\u200c\u200d]+/g, " ").trim();

/** A hit whose Bangla name IS the Bangla name asked for (exactly, or with a generic suffix like "ময়দান"). */
function pickBangla(asked: string, hits: OsmHit[], district?: string): Place | null {
  const want = bnSimple(asked);
  if (want.length < 2) return null;
  const centre = district ? CITY_CENTRES[keyWords(district).filter((w) => w !== "district").join(" ")] : undefined;
  for (const h of hits) {
    const lat = Number(h.lat);
    const lng = Number(h.lon);
    if (!inRegion(lat, lng) || (centre && km(lat, lng, centre[0], centre[1]) > 40)) continue;
    if (bnNames(h).some((n) => bnSimple(n) === want)) return { name: want, lat, lng };
  }
  return null;
}

/**
 * Place lookup for a name written as "English place, District, Country | বাংলা নাম". The English
 * name is matched strictly (see pick); the Bangla one only exactly. Many places in Bangladesh are
 * in OpenStreetMap only under their Bangla name ("রোজ গার্ডেন", Tikatuli).
 */
export async function geocodePlace(full: string): Promise<Place | null> {
  const [name, bangla] = full.split("|").map((x) => x.trim());
  if (!name || isAbroad(name)) return null;
  const parts = name.split(",").map((x) => x.trim()).filter((x) => x && !/^(bangladesh|বাংলাদেশ|east pakistan|পূর্ব পাকিস্তান)$/i.test(x));
  if (!parts.length) return null;
  // Written in Bangla only (e.g. the suggestion's own place): exact Bangla match.
  if (/[\u0980-\u09ff]/.test(parts[0]) && !bangla) {
    try {
      return pickBangla(parts[0], await nominatim(parts.slice(0, 2).join(", ")), undefined) ?? pickBangla(parts[0], await nominatim(parts[0]), undefined);
    } catch {
      return null;
    }
  }
  // With its district first (the right "Shaheed Minar" among many), then the name alone. A hit in
  // another district is used only if nothing in the named district matches.
  const tries = [parts.slice(0, 2).join(", "), parts[0]].filter((x, i, a) => x.length >= 2 && a.indexOf(x) === i);
  const hits: OsmHit[] = [];
  for (const q of tries) {
    try {
      for (const h of await nominatim(q)) if (!hits.some((x) => x.lat === h.lat && x.lon === h.lon)) hits.push(h);
    } catch {
      // the service is down or slow: try the next query
    }
  }
  // Closest name within the named district wins ("Ajmiriganj Upazila" over "… Ajmiriganj … Road").
  const english = pick(parts[0], hits, parts[1]);
  if (english) return english;
  if (bangla) {
    try {
      const r = pickBangla(bangla, await nominatim(bangla), parts[1]);
      if (r) return r;
    } catch {
      // try the broader name below
    }
  }
  // "Paltan Maidan" → the area "Paltan" (only inside the named city): close enough for an approximate pin.
  const core = parts[0].replace(GENERIC, "").replace(/\s+/g, " ").trim();
  if (core && core !== parts[0] && parts[1] && CITY_CENTRES[keyWords(parts[1]).filter((w) => w !== "district").join(" ")]) {
    try {
      const r = pick(core, await nominatim(`${core}, ${parts[1]}`), parts[1]);
      if (r) return r;
    } catch {
      // nothing more to try
    }
  }
  return null;
}

/** Generic words around a place's own name, dropped for a broader second try. */
const GENERIC = /\b(maidan|maydan|field|ground|grounds|square|crossing|intersection|more|chattar|chatwar|area|village|bazar|bazaar|hat|ghat)\b/gi;

/**
 * A readable web address from the event's English name and year, e.g. "death-of-maulana-bhashani-1976".
 * A short random tail keeps it unique; with no usable English name it falls back to "event-<year>-…".
 * Source names ("Wikipedia", "Banglapedia") never end up in it.
 */
export function slugFor(year: number, hint: string): string {
  const base = hint
    .replace(/\s+[—–-]\s+(wikipedia|banglapedia|উইকিপিডিয়া|বাংলাপিডিয়া).*$/i, "")
    .replace(/\b(wikipedia|banglapedia|english|bangla)\b/gi, " ")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
  const tail = Math.random().toString(36).slice(2, 6);
  return `${base || "event"}-${year}-${tail}`.replace(/^-/, "").slice(0, 80);
}

/** Letters from other Indian scripts the model sometimes slips into Bangla (e.g. Telugu in "জন্মగ్రహণ"). */
const FOREIGN_INDIC = /[\u0900-\u097F\u0A00-\u0D7F]/;
/** Bangla text with stray letters of other Indian scripts: flagged, so the admin fixes it. */
export const hasForeignScript = (t: string | null | undefined) => !!t && FOREIGN_INDIC.test(t);

/** "Kagmari, Tangail, Bangladesh" → "Kagmari, Tangail" (the country adds nothing on a Bangladesh map). */
const placeLabel = (name: string | null) => {
  if (!name) return null;
  const [en, bn] = name.split("|").map((x) => x.trim());
  return bn || en.replace(/,\s*(Bangladesh|বাংলাদেশ)\s*$/i, "").trim() || null;
};

const sourceType = (s: ResearchSource): SourceFieldsT["source_type"] =>
  s.source_type === "academic" ? "academic" : s.source_type === "government" ? "government" : s.source_type === "encyclopedia" ? "encyclopedia" : "article";

/** Counts generations + research runs against the same daily limit. */
async function runsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("generation_log").select("id", { count: "exact", head: true }).eq("visitor", `admin:${userId}`).like("place_key", "research:%").gte("created_at", since);
  return count ?? 0;
}

/**
 * Generates a draft event from a suggestion. Reports progress; returns nothing (the event id comes
 * in the "done" message). The AI and network can be replaced in tests.
 */
export async function generateDraft(input: GenerateInput, userId: string, onProgress: (p: GenerateProgress) => void, deps: GenerateDeps = {}): Promise<void> {
  if ((await runsToday(userId)) >= RESEARCH_PER_DAY) {
    onProgress({ type: "error", message: `আজকের সীমা (${RESEARCH_PER_DAY}টি) শেষ। কাল আবার চেষ্টা করুন।` });
    return;
  }
  const { day, month, candidate: c } = input;
  const warnings: string[] = [];

  // 1. Material: the suggestion's page first (S1), then Wikipedia.
  onProgress({ type: "stage", message: "সূত্র সংগ্রহ করা হচ্ছে…" });
  const now = new Date().toISOString();
  const wikiOwn = await wikipediaFromUrl(c.source_url, deps.fetch).catch(() => null);
  const page = wikiOwn ? ({ ok: false, url: c.source_url, reason: "" } as const) : await safeFetch(c.source_url, deps);
  let host = "";
  try {
    host = new URL(page.url).hostname.replace(/^www\./, "");
  } catch {
    // unparsable URL: the page simply failed
  }
  const own: ResearchSource | null = wikiOwn
    ? { ...wikiOwn, id: "S1", origin: "admin_url" }
    : page.ok
    ? {
        id: "S1",
        title: (page.title || host).slice(0, 300),
        url: page.url,
        publisher: host,
        author: null,
        published_on: null,
        source_type: /wikipedia\.org/.test(host) ? "encyclopedia" : /\.gov\.|\.gov$/.test(host) ? "government" : /\.edu|\.ac\./.test(host) ? "academic" : "article",
        origin: "admin_url",
        language: /[ঀ-৿]/.test(page.text.slice(0, 2000)) ? "bn" : "en",
        retrieval: "retrieved",
        excerpt: page.text.slice(0, EXCERPT_CHARS),
        retrieved_at: now,
      }
    : null;
  if (!own) warnings.push(`প্রস্তাবের সূত্রের পাতা খোলা যায়নি (${page.ok ? "" : page.reason}); শুধু উইকিপিডিয়া থেকে লেখা হয়েছে`);
  const wiki = await collectMaterial({ title: c.title_bn, context: `${c.year} ${c.place}` }, { fetch: deps.fetch, resolve: deps.resolve, wikidata: deps.wikidata });
  const sources = [...(own ? [own] : []), ...wiki.sources.filter((s) => s.url !== own?.url)].map((s, i) => ({ ...s, id: `S${i + 1}` }));
  if (!sources.some((s) => s.retrieval === "retrieved")) {
    onProgress({ type: "error", message: "কোনো সূত্র থেকে লেখা আনা যায়নি, তাই খসড়া তৈরি হয়নি। অন্য ঘটনা বেছে নিন বা পরে চেষ্টা করুন।" });
    return;
  }

  // 2. AI report, checked.
  onProgress({ type: "stage", message: "AI ঘটনা ও টাইমলাইন লিখছে…" });
  const prompt = researchPrompt(
    {
      title: c.title_bn,
      context: `On this day: ${day}/${month}/${c.year}. ${c.summary_bn} Place: ${c.place}. Write 3–8 timeline steps for a map: each step at a specific named place where possible. Write every place_name (and from_place_name) as "English place, District, Country | Bangla name", e.g. "Paltan Maidan, Dhaka, Bangladesh | পল্টন ময়দান"; "Rose Garden Palace, Dhaka, Bangladesh | রোজ গার্ডেন"; "Kolkata, West Bengal, India | কলকাতা". Use the full proper English name of the place (e.g. "Rose Garden Palace", not "Rose Garden").`,
    },
    sources,
    wiki.wikidata,
  );
  let report: ResearchReport | null = null;
  let model = "";
  try {
    const raw = await (deps.analyse ?? realAnalyse)(prompt);
    model = raw.model;
    let json: unknown = null;
    try {
      json = JSON.parse(raw.text);
    } catch {
      // not JSON
    }
    report = validateReport(json, sources);
  } catch (e) {
    console.error("generate analyse:", e);
    onProgress({ type: "error", message: /RESOURCE_EXHAUSTED|429|quota/i.test(String(e)) ? "AI-এর আজকের সীমা শেষ। পরে আবার চেষ্টা করুন।" : "AI লিখতে পারেনি। আবার চেষ্টা করুন।" });
    return;
  }
  if (!report || !report.steps.length) {
    onProgress({ type: "error", message: "AI-এর উত্তর থেকে টাইমলাইন তৈরি করা যায়নি। আবার চেষ্টা করুন।" });
    return;
  }
  // Real misses only (quotes not in the source, unknown sources), not rating adjustments.
  const misses = report.validation.filter((v) => /পাওয়া যায়নি|অজানা সূত্র|সংগ্রহ করা যায়নি/.test(v)).length;
  if (misses) warnings.push(`AI-এর ${misses}টি উদ্ধৃতি সূত্রে মেলেনি; সেসব দাবি "বিতর্কিত" হিসেবে রাখা হয়েছে — পড়ে দেখুন`);

  // 3. Places.
  onProgress({ type: "stage", message: "মানচিত্রে স্থান খোঁজা হচ্ছে…" });
  const geocode = deps.geocode ?? geocodePlace;
  const cache = new Map<string, Promise<Place | null>>();
  const find = (name: string | null) => {
    if (!name) return Promise.resolve(null);
    if (!cache.has(name)) cache.set(name, geocode(name));
    return cache.get(name)!;
  };
  const main = (await find(c.place)) ?? (await find(report.overview.main_place));
  const matched: string[] = [];

  // 4. Save: the event, then its sources, phases and steps.
  onProgress({ type: "stage", message: "খসড়া সংরক্ষণ করা হচ্ছে…" });
  const fields = EventFields.parse({
    slug: slugFor(c.year, report.overview.title_en ?? ""),
    title: c.title_bn.slice(0, 200),
    summary: (report.overview.summary.text || c.summary_bn).slice(0, 600),
    narrative: [report.overview.background?.text, report.overview.context?.text].filter(Boolean).join("\n\n").slice(0, 20000) || null,
    language: "bn",
    event_year: c.year,
    event_month: month,
    event_day: day,
    date_precision: "day",
    recurring: true,
    place_name: main?.name ?? c.place ?? null,
    country: input.country,
    lat: main?.lat ?? null,
    lng: main?.lng ?? null,
  });
  if (!main) warnings.push("মূল স্থান মানচিত্রে পাওয়া যায়নি; সম্পাদনায় গিয়ে স্থান বেছে নিন");
  const event = await createEvent(fields, userId);
  await db().from("historical_events").update({ ai_assisted: true }).eq("id", event.id);

  // The research record (private): what was retrieved and what the AI wrote, for later comparison.
  const { data: run } = await db()
    .from("historical_event_research")
    .insert({ event_id: event.id, status: "ready", input: { title: c.title_bn, context: c.summary_bn, urls: [c.source_url], on_this_day: { day, month, country: input.country } }, sources, leads: wiki.leads, draft: report, model, created_by: userId })
    .select("id")
    .single();
  await db().from("generation_log").insert({ visitor: `admin:${userId}`, place_key: `research:${event.id}` });
  void run;

  // Sources: every retrieved one (unverified; publishing verifies them).
  const sourceIds = new Map<string, string>();
  for (const s of sources.filter((x) => x.retrieval === "retrieved")) {
    const added = await addSource(
      event.id,
      { title: s.title, url: s.url, author_or_publisher: s.publisher || null, published_on: s.published_on, source_type: sourceType(s), notes: report.source_notes[s.id] ?? "AI খসড়ার জন্য সংগৃহীত", verified: false, evidence_quote: null },
      userId,
    );
    sourceIds.set(s.id, added.id);
  }
  await db().from("historical_event_sources").update({ origin: "ai_suggestion" }).eq("event_id", event.id);

  // Phases: the AI's (up to 4), else one for the whole event.
  const phases: PhaseT[] = (report.phases.length ? report.phases : [{ id: "main", label: "ঘটনা" }]).slice(0, 4).map((p, i) => ({ id: p.id, label: p.label, color: PHASE_COLORS[i] }));
  await setPhases(event.id, phases, userId);
  const phaseIds = new Set(phases.map((p) => p.id));

  let unplaced = 0;
  for (const s of report.steps) {
    const place = await find(s.place_name);
    const from = s.map_type === "route" && place ? await find(s.from_place_name) : null;
    if (!place && s.place_name) unplaced++;
    if (place && s.place_name) matched.push(`${placeLabel(s.place_name)} → ${place.name}`);
    const mapType = !place ? "none" : s.map_type === "route" && from ? "route" : s.map_type === "area" ? "marker" : "marker";
    const cited = [...new Set(s.citations.filter((x) => x.found).map((x) => sourceIds.get(x.source_id)).filter((x): x is string => !!x))];
    const step = StepFields.parse({
      title: s.title,
      narrative: [s.text, s.uncertainty && `অনিশ্চয়তা: ${s.uncertainty}`].filter(Boolean).join("\n\n"),
      date_label: s.date_label,
      phase_id: s.phase && phaseIds.has(s.phase) ? s.phase : phases[0].id,
      map_type: mapType,
      location_precision: place ? "approximate" : "unknown",
      // Shown to visitors: the map's (Bangla) name when found; otherwise the AI's, without the country.
      place_name: placeLabel(s.place_name)?.match(/[\u0980-\u09ff]/) ? placeLabel(s.place_name) : (place?.name ?? placeLabel(s.place_name)),
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      from_place_name: from ? from.name : null,
      from_lat: from?.lat ?? null,
      from_lng: from?.lng ?? null,
      evidence: SUGGESTED_PUBLIC_EVIDENCE[s.evidence],
      verified: false,
      source_ids: cited,
    });
    await addStep(event.id, step, userId);
  }
  const abroad = report.steps.filter((s) => s.place_name && isAbroad(s.place_name)).length;
  if (abroad) warnings.push(`${abroad}টি ধাপ বাংলাদেশের বাইরে; মানচিত্রে পিন দেওয়া হয়নি`);
  if (unplaced - abroad > 0) warnings.push(`${unplaced - abroad}টি ধাপের স্থান মানচিত্রে পাওয়া যায়নি (শুধু লেখা, পিন নেই)`);
  const garbled = [fields.title, fields.summary, fields.narrative, ...report.steps.flatMap((x) => [x.title, x.text])].filter(hasForeignScript).length;
  if (garbled) warnings.push(`${garbled}টি লেখায় অন্য ভাষার অক্ষর ঢুকে গেছে (AI-এর ত্রুটি); সম্পাদনায় ঠিক করুন`);
  if (main) matched.unshift(`মূল স্থান: ${(c.place || report.overview.main_place || "").split(",")[0]} → ${main.name}`);
  if (matched.length) warnings.push(`মানচিত্রে বসানো স্থান (আনুমানিক; ভুল হলে সম্পাদনায় ঠিক করুন): ${[...new Set(matched)].join(" · ")}`);
  if (!input.candidate.check?.confirmed) warnings.push("এই ঘটনার তারিখ স্বয়ংক্রিয়ভাবে নিশ্চিত করা যায়নি; প্রকাশের আগে সূত্রের লিংক খুলে দেখুন");

  const bundle = await getEvent(event.id);
  onProgress({ type: "done", event_id: bundle!.event.id, warnings });
}
