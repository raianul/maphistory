import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { COUNTRIES, discoverEvents, type Candidate, type CountryCode } from "@/lib/research/discover";
import { RESEARCH_PER_DAY } from "@/lib/research/run";
import { normalise } from "@/lib/research/validate";
import { z } from "zod";

/** Gemini with Google Search, then a fetch of every source page: give it time. */
export const maxDuration = 120;

const Query = z.object({
  day: z.coerce.number().int().min(1).max(31),
  month: z.coerce.number().int().min(1).max(12),
  country: z.enum(Object.keys(COUNTRIES) as [CountryCode, ...CountryCode[]]),
});

/**
 * "On this day" suggestions for a day, month and country: ?day=16&month=11&country=BD[&fresh=1].
 * Admin only. A saved search for that day is returned at once (no AI call); `fresh=1` runs a new AI
 * search and saves it in place of the old one. Each suggestion: { year, title_bn, summary_bn,
 * place, category, source_url, source_quote, check, existing: { id, title, status } | null }.
 * Which events already exist is worked out on every request (so generating one marks it).
 */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) return Response.json({ error: "Invalid date or country" }, { status: 400 });
  const { day, month, country } = parsed.data;
  if (day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) return Response.json({ error: "This month doesn't have that many days" }, { status: 400 });
  const fresh = params.fresh === "1";
  /** Only a saved list was asked for (opening the page): never start an AI search for it. */
  const savedOnly = params.saved === "1";

  try {
    // 1. The saved search, unless a new one is asked for.
    const saved = fresh ? null : await loadSearch(country, month, day);
    let result: { candidates: Candidate[]; dropped: number; searched_at: string | null };
    if (saved) result = saved;
    else if (savedOnly) result = { candidates: [], dropped: 0, searched_at: null };
    else {
      // Same daily budget as research and generation (each search is one AI call).
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { count } = await db().from("generation_log").select("id", { count: "exact", head: true }).eq("visitor", `admin:${admin.userId}`).like("place_key", "research:%").gte("created_at", since);
      if ((count ?? 0) >= RESEARCH_PER_DAY * 2) return Response.json({ error: `Today's limit reached. Try again tomorrow.` }, { status: 429 });
      await db().from("generation_log").insert({ visitor: `admin:${admin.userId}`, place_key: `research:discover-${month}-${day}` });
      const found = await discoverEvents(day, month, country);
      const searched_at = await saveSearch(country, month, day, found.candidates, found.dropped, admin.userId);
      result = { ...found, searched_at };
    }
    return Response.json({ day, month, country, ...(await withExisting(month, day, result.candidates)), dropped: result.dropped, searched_at: result.searched_at, cached: !!saved });
  } catch (e) {
    console.error("on-this-day discover:", e);
    const quota = /RESOURCE_EXHAUSTED|429|quota/i.test(String(e));
    return Response.json({ error: quota ? "The AI's daily limit is reached. Try again later." : "Could not find events. Please try again." }, { status: 502 });
  }
}

const SEARCHES = "on_this_day_searches";
/** The table doesn't exist until the on_this_day_searches migration has been run: then nothing is saved. */
const missing = (code?: string) => code === "42P01" || code === "PGRST205";

async function loadSearch(country: string, month: number, day: number) {
  const { data, error } = await db().from(SEARCHES).select("candidates, dropped, searched_at").eq("country", country).eq("month", month).eq("day", day).maybeSingle();
  if (error && !missing(error.code)) throw new Error(`Database: ${error.message}`);
  return data ? { candidates: data.candidates as Candidate[], dropped: data.dropped as number, searched_at: data.searched_at as string } : null;
}

async function saveSearch(country: string, month: number, day: number, candidates: Candidate[], dropped: number, userId: string): Promise<string> {
  const searched_at = new Date().toISOString();
  const { error } = await db().from(SEARCHES).upsert({ country, month, day, candidates, dropped, searched_by: userId, searched_at });
  if (error && !missing(error.code)) console.error("on-this-day save:", error.message);
  return searched_at;
}

/**
 * Marks each suggestion against what is already saved:
 *  - `existing`: a story already shows on this date (its date row exists), matched by the subject's
 *    Wikidata id, the same source link, or the same year and a similar title → "open it".
 *  - `story`: the subject already has a story, but not this date → "add this date" (no AI call).
 * Also lists the day's other saved dates (stories the search didn't mention).
 */
async function withExisting(month: number, day: number, candidates: Candidate[]) {
  // The stories with a date on this day (drafts included), and every story with one of the suggested subjects.
  const { data: dayRows } = await db().from("historical_event_dates").select("id, event_id, year, title, status").eq("month", month).eq("day", day);
  const dates = dayRows ?? [];
  const qids = [...new Set(candidates.map((c) => c.subject_qid).filter((q): q is string => !!q))];
  const [{ data: dayStories }, { data: bySubject }] = await Promise.all([
    dates.length ? db().from("historical_events").select("id, title, status, wikidata_id").in("id", [...new Set(dates.map((d) => d.event_id))]) : Promise.resolve({ data: [] }),
    qids.length ? db().from("historical_events").select("id, title, status, wikidata_id").in("wikidata_id", qids) : Promise.resolve({ data: [] }),
  ]);
  type Story = { id: string; title: string; status: string; wikidata_id: string | null };
  const stories = new Map<string, Story>();
  for (const s of [...((dayStories ?? []) as Story[]), ...((bySubject ?? []) as Story[])]) stories.set(s.id, s);
  const { data: runs } = stories.size ? await db().from("historical_event_research").select("event_id, input").in("event_id", [...stories.keys()]) : { data: [] };
  const byUrl = new Map<string, string>();
  for (const r of runs ?? []) for (const u of ((r.input as { urls?: string[] })?.urls ?? [])) byUrl.set(u, r.event_id as string);
  const words = (s: string) => new Set(normalise(s).split(/[\s,।:;—-]+/).filter((w) => w.length > 2));
  const similar = (a: string, b: string) => {
    const A = words(a);
    const B = words(b);
    const common = [...A].filter((w) => B.has(w)).length;
    return common / Math.max(1, Math.min(A.size, B.size)) >= 0.5;
  };
  const out = candidates.map((c) => {
    const subject = c.subject_qid ? [...stories.values()].find((s) => s.wikidata_id === c.subject_qid) : undefined;
    // A date on this day of the same story (by subject, link, or year + similar title).
    const date =
      dates.find((d) => d.year === c.year && subject && d.event_id === subject.id) ??
      dates.find((d) => d.year === c.year && d.event_id === byUrl.get(c.source_url)) ??
      dates.find((d) => d.year === c.year && (similar(d.title, c.title_bn) || similar(stories.get(d.event_id)?.title ?? "", c.title_bn)));
    const shown = date ? stories.get(date.event_id) : undefined;
    return {
      ...c,
      existing: shown && date ? { id: shown.id, title: date.title, status: date.status === "published" && shown.status === "published" ? "published" : shown.status, story_title: shown.title } : null,
      story: !date && subject ? { id: subject.id, title: subject.title, status: subject.status } : null,
    };
  });
  const saved = dates
    .filter((d) => !out.some((c) => c.existing?.id === d.event_id))
    .map((d) => ({ id: d.event_id, title: d.title, status: stories.get(d.event_id)?.status ?? "draft", year: d.year }));
  return { candidates: out, saved };
}
