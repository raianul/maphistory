/**
 * The admin's Home page: what needs the editor today. Server-side only (the secret key, via db()).
 * Every part degrades on its own: a missing table (a migration not run yet) empties that part,
 * it never breaks the page.
 */
import { db } from "./db";
import { categoriesOf, categoryLabels, guessCategories } from "./categories";
import { eventsOnDay } from "./events/public";
import { todayInDhaka } from "./events/schema";

/** "Popular" for an unchecked place: at least this many opens in the last 7 days... */
export const POPULAR_WEEK = 5;
/** ...or, before the daily-opens migration, this many opens in all. */
export const POPULAR_TOTAL = 20;
/** A place visitors dislike: at least this many 👎, and more than its 👍. */
export const DISLIKED_MIN = 3;

export type HomePlace = {
  id: string;
  slug: string | null;
  name_bn: string;
  name_en: string | null;
  /** The map chip it falls under (Bangla), if any. */
  category?: string;
  status: "ai" | "verified" | "hidden";
  show_on_map: boolean;
  /** Opens in the last 7 days (null before the daily-opens migration), and in all. */
  week: number | null;
  views: number;
  likes: number;
  created_at: string;
};

export type HomeDay = { year: number; month: number; day: number; live: number };

export type AdminHome = {
  counts: { reports: number; review: number; popular: number; emptyDays: number; total: number };
  /** Today and the 6 days after it, with how many published events each shows. */
  days: HomeDay[];
  /** Unchecked places opened most (this week when known). */
  popular: HomePlace[];
  /** Stories AI wrote in the last 7 days, still unchecked. */
  fresh: HomePlace[];
  /** The latest visitor reports, newest first. */
  reports: { story_id: string; name_bn: string; message: string | null; created_at: string }[];
  /** Places with more 👎 than 👍. */
  disliked: { id: string; name_bn: string; likes: number; dislikes: number }[];
  /** Whether "this week" numbers exist yet (the daily-opens migration has been run). */
  weekly: boolean;
};

type StoryRow = {
  id: string;
  slug: string | null;
  name_bn: string;
  name_en: string | null;
  status: HomePlace["status"];
  show_on_map?: boolean;
  views: number;
  created_at: string;
  category?: string | null;
  kind_bn: string | null;
  era: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The 7 Bangladesh dates from today. */
export function nextDays(now = new Date()): { year: number; month: number; day: number }[] {
  const t = todayInDhaka(now);
  const base = Date.UTC(t.year, t.month - 1, t.day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base + i * 86_400_000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  });
}

export async function adminHome(now = new Date()): Promise<AdminHome> {
  const days = nextDays(now);
  const weekStart = new Date(Date.UTC(days[0].year, days[0].month - 1, days[0].day) - 6 * 86_400_000);

  // Stories (not hidden): with the editor's category when that column exists.
  const cols = "id,slug,name_bn,name_en,status,show_on_map,views,created_at,kind_bn:story->>kind_bn,era:story->>era_label_bn";
  const stories = async (columns: string) => db().from("stories").select(columns).neq("status", "hidden").order("views", { ascending: false }).limit(5000);
  let st = await stories(`${cols},category`);
  if (st.error) st = await stories(cols);
  if (st.error) st = await stories("id,slug,name_bn,name_en,status,views,created_at,kind_bn:story->>kind_bn,era:story->>era_label_bn");
  if (st.error) throw new Error(`Database: ${st.error.message}`);
  const rows = (st.data ?? []) as unknown as StoryRow[];

  const [week, likes, reports, review, dayEvents] = await Promise.all([
    // Opens per place in the last 7 days (null: the table doesn't exist yet).
    db()
      .from("story_views_daily")
      .select("story_id,views")
      .gte("day", iso(weekStart))
      .limit(50_000)
      .then(({ data, error }) => {
        if (error) return null;
        const m = new Map<string, number>();
        for (const r of data ?? []) m.set(r.story_id as string, (m.get(r.story_id as string) ?? 0) + (r.views as number));
        return m;
      }),
    db()
      .from("place_reaction_totals")
      .select("slug,likes,dislikes")
      .then(({ data, error }) => new Map(error ? [] : (data ?? []).map((r) => [r.slug as string, { likes: r.likes as number, dislikes: r.dislikes as number }]))),
    db()
      .from("story_reports")
      .select("story_id,message,created_at,stories(name_bn)")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => data ?? []),
    db()
      .from("historical_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "review")
      .then(({ count }) => count ?? 0),
    // Published events per day (the public cache; a date with none shows the next one: not "live").
    Promise.all(days.map((d) => eventsOnDay(d.month, d.day, d.year).then((r) => (r.next ? 0 : r.events.length)).catch(() => 0))),
  ]);

  const place = (r: StoryRow): HomePlace => {
    const cat = categoryLabels(categoriesOf(r.category, guessCategories({ kind_bn: r.kind_bn, era: r.era })));
    return {
      id: r.id,
      slug: r.slug,
      name_bn: r.name_bn,
      name_en: r.name_en,
      ...(cat ? { category: cat } : {}),
      status: r.status,
      show_on_map: !!r.show_on_map,
      week: week ? (week.get(r.id) ?? 0) : null,
      views: r.views,
      likes: (r.slug && likes.get(r.slug)?.likes) || 0,
      created_at: r.created_at,
    };
  };

  const unchecked = rows.filter((r) => r.status === "ai").map(place);
  const hot = (p: HomePlace) => (week ? (p.week ?? 0) >= POPULAR_WEEK : p.views >= POPULAR_TOTAL);
  const popular = unchecked.filter(hot).sort((a, b) => (week ? (b.week ?? 0) - (a.week ?? 0) : b.views - a.views));
  const fresh = unchecked
    .filter((p) => p.created_at >= weekStart.toISOString())
    .sort((a, b) => (b.week ?? b.views) - (a.week ?? a.views))
    .slice(0, 6);

  const bySlug = new Map(rows.filter((r) => r.slug).map((r) => [r.slug!, r]));
  const disliked = [...likes.entries()]
    .filter(([slug, v]) => v.dislikes >= DISLIKED_MIN && v.dislikes > v.likes && bySlug.has(slug))
    .map(([slug, v]) => ({ id: bySlug.get(slug)!.id, name_bn: bySlug.get(slug)!.name_bn, ...v }))
    .sort((a, b) => b.dislikes - b.likes - (a.dislikes - a.likes))
    .slice(0, 5);

  type ReportRow = { story_id: string; message: string | null; created_at: string; stories: { name_bn: string } | { name_bn: string }[] | null };
  const reportList = (reports as unknown as ReportRow[]).map((r) => ({
    story_id: r.story_id,
    name_bn: (Array.isArray(r.stories) ? r.stories[0]?.name_bn : r.stories?.name_bn) ?? "",
    message: r.message,
    created_at: r.created_at,
  }));
  // Places with reports still open (cleared reports are deleted).
  const { count: reportedPlaces } = await db().from("stories").select("id", { count: "exact", head: true }).gt("reports", 0).neq("status", "hidden");

  const dayList = days.map((d, i) => ({ ...d, live: dayEvents[i] }));
  const counts = {
    reports: reportedPlaces ?? 0,
    review,
    popular: popular.length,
    emptyDays: dayList.filter((d) => d.live === 0).length,
    total: 0,
  };
  counts.total = counts.reports + counts.review + counts.popular + counts.emptyDays;

  return { counts, days: dayList, popular: popular.slice(0, 5), fresh, reports: reportList, disliked, weekly: !!week };
}
