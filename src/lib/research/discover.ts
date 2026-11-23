/**
 * "On this day" discovery: which historical events happened in a country on a given day and month?
 *
 * Gemini answers with Google Search turned on, under strict rules (the exact day only, a real page
 * that states the date, fewer rather than stretched). The answer is untrusted: the application
 * then opens every source page itself (SSRF-safe) and checks that it mentions the date near the
 * event. Each suggestion comes back as "confirmed" or "unconfirmed" with the reason; nothing is
 * saved. Server-side only.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { FALLBACK_MODEL, GEMINI_MODEL } from "../ai/model";
import { safeFetch } from "./fetch";
import { wikidataIdFor, wikipediaFromUrl, type NetDeps } from "./sources";
import { normalise } from "./validate";

export const COUNTRIES = {
  BD: { en: "Bangladesh", bn: "বাংলাদেশ", note: "including the territory before 1971 (East Pakistan, East Bengal, Bengal Presidency)" },
} as const;
export type CountryCode = keyof typeof COUNTRIES;

export const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toBnDigits = (n: number) => String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

export const CATEGORIES = ["war", "politics", "culture", "disaster", "birth", "death", "founding", "other"] as const;

export type Candidate = {
  year: number;
  title_bn: string;
  summary_bn: string;
  place: string;
  category: (typeof CATEGORIES)[number];
  source_url: string;
  source_quote: string;
  /** Who or what the story is about (Bangla), e.g. "কাজী নজরুল ইসলাম", "তাজরীন ফ্যাশনস অগ্নিকাণ্ড". */
  subject?: string;
  /** person: a life (birth, award, death…); event: one happening. */
  kind?: "person" | "event";
  /** The English Wikipedia article about the subject itself, as the AI named it. */
  subject_wikipedia_url?: string;
  /** Set by the application: the subject's Wikidata id, from that article (identity across titles). */
  subject_qid?: string | null;
  /** Set by the application after opening the page. */
  check: { confirmed: boolean; reason: string; page_title: string | null };
};

const RawCandidate = z.object({
  year: z.number().int().min(-500).max(2100),
  title_bn: z.string().trim().min(2).max(200),
  summary_bn: z.string().trim().max(800).catch(""),
  place: z.string().trim().max(200).catch(""),
  category: z.enum(CATEGORIES).catch("other"),
  source_url: z.string().trim().max(2000),
  source_quote: z.string().trim().max(1200).catch(""),
  subject: z.string().trim().max(200).optional().catch(undefined),
  kind: z.enum(["person", "event"]).optional().catch(undefined),
  subject_wikipedia_url: z.string().trim().max(2000).optional().catch(undefined),
});
const RawAnswer = z.object({ events: z.array(z.unknown()).max(20).catch([]) });

export function discoverPrompt(day: number, month: number, country: CountryCode): string {
  const c = COUNTRIES[country];
  const date = `${day} ${MONTHS_EN[month - 1]}`;
  return `You are a careful historian. Using Google Search, list historical events that happened in ${c.en} (${c.note}) on ${date}, in any year.

STRICT RULES
1. The event must have happened ON ${date} exactly. Not the day before or after, not "around" that date, not "the aftermath". If the exact day is uncertain or disputed, leave it out.
2. Each event must be supported by a web page you actually found that states the day and month. Give that page's URL exactly. Never invent or guess a URL. Prefer Wikipedia, Banglapedia, government, university and major newspaper pages.
3. Only notable events: politics, war and the liberation struggle, culture, disasters, founding of institutions, births and deaths of nationally significant people.
4. No stretched connections ("on this day her struggle was remembered") and no vague entries ("a turbulent political day").
5. Fewer is better. 0 is acceptable. At most 7.
6. If you are not confident about any detail (year, place, name), leave the event out.
7. "source_quote": copied word for word from the page's main text, and it must itself contain the day and month. Not from image captions, infoboxes or reference lists.
8. "place": the most specific place the source names (building, campus, area, then city), e.g. "Dhaka Medical College, Dhaka", not just "Dhaka".

Return ONLY JSON, no other text, no markdown:
{"events":[{"year":1971,"title_bn":"short Bangla title, at most 12 words","summary_bn":"one or two Bangla sentences: what happened, where","place":"...","category":"war|politics|culture|disaster|birth|death|founding|other","source_url":"https://...","source_quote":"...","subject":"who or what it is about, in Bangla: the person's name (for a birth, death, award, arrest…) or the event's name","kind":"person|event","subject_wikipedia_url":"the English Wikipedia article about that person or event itself (not a list, timeline or year page); empty if none"}]}
Sort by year, oldest first. Titles and summaries in clear modern Bangla.`;
}

/** Calls Gemini with Google Search (main model, then the lighter one on overload). Returns raw text. */
export async function askGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  const run = (model: string) => ai.models.generateContent({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
  try {
    return (await run(GEMINI_MODEL)).text ?? "";
  } catch (e) {
    if (!/UNAVAILABLE|503|high demand|RESOURCE_EXHAUSTED|429|quota/i.test(String(e))) throw e;
    return (await run(FALLBACK_MODEL)).text ?? "";
  }
}

/** The JSON object in a model answer (it may come wrapped in a code fence or prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** "[url](url)" (chat formatting) → url. */
const cleanUrl = (u: string) => u.replace(/^\[[^\]]*\]\((.*)\)$/, "$1").replace(/^<|>$/g, "").trim();

/** Ways a page may write the date: "21 February", "February 21", "২১ ফেব্রুয়ারি", "২১শে ফেব্রুয়ারি". */
export function datePatterns(day: number, month: number): RegExp[] {
  const en = MONTHS_EN[month - 1].toLowerCase();
  const bnMonth = MONTHS_BN[month - 1];
  const d = `0?${day}`;
  const bnD = `(?:${toBnDigits(day)}|০${toBnDigits(day)})`;
  return [
    new RegExp(`\\b${d}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${en}\\b`),
    new RegExp(`\\b${en}\\s+${d}(?:st|nd|rd|th)?\\b`),
    new RegExp(`${bnD}\\s*(?:শে|এ|ই|লা|রা|ঠা)?\\s*${bnMonth}`),
    new RegExp(`${bnMonth}\\s*${bnD}`),
  ];
}

/** How close the year must be to the day and month: the same phrase ("21 February 1963", "১৯৭২ সালের ২১শে ফেব্রুয়ারি"). */
const YEAR_WINDOW = 60;

/** Whether the page text states this day and month together with the year, in the same sentence. */
export function pageStatesDate(text: string, day: number, month: number, year: number): boolean {
  const t = normalise(text);
  const years = [String(year), toBnDigits(year)];
  for (const re of datePatterns(day, month)) {
    const g = new RegExp(re.source, "g");
    for (const m of t.matchAll(g)) {
      const before = t.slice(Math.max(0, m.index! - YEAR_WINDOW), m.index!).split(/[.।!?]\s/).pop()!;
      const after = t.slice(m.index! + m[0].length, m.index! + m[0].length + YEAR_WINDOW).split(/[.।!?]\s/)[0];
      const near = `${before} ${m[0]} ${after}`;
      if (years.some((y) => new RegExp(`(^|[^0-9০-৯])${y}([^0-9০-৯]|$)`).test(near))) return true;
    }
  }
  return false;
}

/** Opens a suggestion's page and decides whether it confirms the date. Never throws. */
export async function checkCandidate(
  c: Omit<Candidate, "check">,
  day: number,
  month: number,
  deps: NetDeps,
): Promise<Candidate["check"]> {
  // Wikipedia pages are read through its API (plain text, follows redirects); others SSRF-safely.
  const wiki = await wikipediaFromUrl(c.source_url, deps.fetch, 400_000).catch(() => null); // whole article: the date may be far down
  const page = wiki ? { ok: true as const, title: wiki.title, text: wiki.excerpt ?? "" } : await safeFetch(c.source_url, deps);
  if (!page.ok) return { confirmed: false, reason: `Could not open the source page: ${page.reason}`, page_title: null };
  const quoteOk = c.source_quote.length >= 12 && normalise(page.text.replace(/\[\s*\d+\s*\]/g, " ")).includes(normalise(c.source_quote));
  if (pageStatesDate(page.text, day, month, c.year)) {
    return { confirmed: true, reason: quoteOk ? "Page has both the quote and the date" : "Page has the date and year (quote not an exact match)", page_title: page.title };
  }
  const dayOnly = datePatterns(day, month).some((re) => re.test(normalise(page.text)));
  return {
    confirmed: false,
    reason: dayOnly ? "Page has the day and month, but not next to the year" : "Page opened, but this day and month weren't found on it",
    page_title: page.title,
  };
}

/**
 * Finds candidate events for a day and month. Malformed entries and duplicates are dropped; every
 * remaining one is checked against its page. Sorted by year.
 */
export async function discoverEvents(
  day: number,
  month: number,
  country: CountryCode,
  deps: NetDeps & { ask?: (prompt: string) => Promise<string> } = {},
): Promise<{ candidates: Candidate[]; dropped: number }> {
  const text = await (deps.ask ?? askGemini)(discoverPrompt(day, month, country));
  const parsed = RawAnswer.safeParse(extractJson(text));
  if (!parsed.success) throw new Error("Could not read the AI's answer");
  let dropped = 0;
  const seen = new Set<string>();
  const raw: Omit<Candidate, "check">[] = [];
  for (const item of parsed.data.events) {
    const r = RawCandidate.safeParse(item);
    if (!r.success) {
      dropped++;
      continue;
    }
    const url = cleanUrl(r.data.source_url);
    const key = `${r.data.year}|${normalise(r.data.title_bn)}`;
    if (!/^https?:\/\//i.test(url) || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    raw.push({ ...r.data, source_url: url });
  }
  // Each suggestion's page is checked for the date, and its subject identified (Wikidata, via the
  // subject's own Wikipedia article): the same person or event is then recognised whatever the title.
  const candidates = await Promise.all(
    raw.slice(0, 7).map(async (c) => {
      const wiki = c.subject_wikipedia_url ? c.subject_wikipedia_url.replace(/^\[[^\]]*\]\((.*)\)$/, "$1").trim() : "";
      const [check, subject_qid] = await Promise.all([checkCandidate(c, day, month, deps), wiki ? wikidataIdFor(wiki, deps.fetch) : Promise.resolve(null)]);
      return { ...c, subject_wikipedia_url: wiki || undefined, subject_qid, check };
    }),
  );
  candidates.sort((a, b) => a.year - b.year);
  return { candidates, dropped };
}
