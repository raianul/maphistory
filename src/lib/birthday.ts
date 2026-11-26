/**
 * "আপনার জন্মদিনে বাংলাদেশে কী ঘটেছিল": the events of one day and month, for anyone's birthday.
 * Uses the same AI search as the admin's On this day finder, and the same saved list
 * (on_this_day_searches): a day searched here is already done in the admin, and the other way
 * round. Each day is searched at most once (366 in all); everyone after that gets the saved list.
 * Nothing about the visitor is stored. Server-side only.
 */
import { db } from "./db";
import { discoverEvents, type Candidate } from "./research/discover";

const COUNTRY = "BD";
const SEARCHES = "on_this_day_searches";
const missing = (code?: string) => code === "42P01" || code === "PGRST205";

/** New AI searches started by visitors, at most this many an hour (the rest wait for a saved day). */
const NEW_SEARCHES_PER_HOUR = 30;

export type BirthdayEvent = { year: number; title_bn: string; summary_bn: string; place: string; source_url: string };
export type BirthdayDay = { month: number; day: number; events: BirthdayEvent[] };

/** "12-16" → { month: 12, day: 16 }, a real date (29 Feb included); undefined otherwise. */
export function parseMonthDay(md: string): { month: number; day: number } | undefined {
  const m = md.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) return undefined;
  return { month, day };
}

export const monthDay = (month: number, day: number) => `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// A birthday card should feel like one: happy kinds first, tragedies last.
const ORDER: Candidate["category"][] = ["founding", "culture", "birth", "other", "politics", "war", "disaster", "death"];

/** The day's best events for a card: those whose source page states the date first, then by kind and year. */
export function pickForCard(candidates: Candidate[], max = 5): BirthdayEvent[] {
  const seen = new Set<string>();
  return [...candidates]
    .filter((c) => c.title_bn && c.year)
    .sort(
      (a, b) =>
        Number(b.check?.confirmed ?? false) - Number(a.check?.confirmed ?? false) ||
        ORDER.indexOf(a.category) - ORDER.indexOf(b.category) ||
        a.year - b.year,
    )
    .filter((c) => {
      const key = `${c.year}|${c.title_bn}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .sort((a, b) => a.year - b.year)
    .map((c) => ({ year: c.year, title_bn: c.title_bn, summary_bn: c.summary_bn, place: c.place, source_url: c.source_url }));
}

async function loadSaved(month: number, day: number): Promise<Candidate[] | null> {
  const { data, error } = await db().from(SEARCHES).select("candidates").eq("country", COUNTRY).eq("month", month).eq("day", day).maybeSingle();
  if (error && !missing(error.code)) throw new Error(`Database: ${error.message}`);
  return data ? (data.candidates as Candidate[]) : null;
}

/** Two people asking for the same new day at once share one search (per server instance). */
const inFlight = new Map<string, Promise<Candidate[]>>();

async function searchAndSave(month: number, day: number): Promise<Candidate[]> {
  // A cap on new searches, so nobody can use up the AI quota by trying every date.
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db().from("generation_log").select("id", { count: "exact", head: true }).like("place_key", "birthday:%").gte("created_at", since);
  if ((count ?? 0) >= NEW_SEARCHES_PER_HOUR) throw new BusyError();
  await db().from("generation_log").insert({ visitor: "birthday", place_key: `birthday:${monthDay(month, day)}` });
  const found = await discoverEvents(day, month, COUNTRY);
  const { error } = await db()
    .from(SEARCHES)
    .upsert({ country: COUNTRY, month, day, candidates: found.candidates, dropped: found.dropped, searched_by: null, searched_at: new Date().toISOString() });
  if (error && !missing(error.code)) console.error("birthday save:", error.message);
  return found.candidates;
}

export class BusyError extends Error {
  constructor() {
    super("busy");
  }
}

/** The day's card events: the saved list, or (only if `search`) a new search, saved for everyone. */
export async function birthdayDay(month: number, day: number, { search }: { search: boolean }): Promise<BirthdayDay | null> {
  let candidates = await loadSaved(month, day);
  if (!candidates) {
    if (!search) return null;
    const key = monthDay(month, day);
    let run = inFlight.get(key);
    if (!run) {
      run = searchAndSave(month, day).finally(() => inFlight.delete(key));
      inFlight.set(key, run);
    }
    candidates = await run;
  }
  return { month, day, events: pickForCard(candidates) };
}
