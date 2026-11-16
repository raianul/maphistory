/**
 * A research run, end to end, with each stage saved as it finishes: collect sources → (save) →
 * AI analysis → check the answer → (save). If the AI fails, the collected sources stay saved and
 * the run is marked failed with a useful message. Nothing here writes to the event, its sources
 * or its steps: research stays private until the admin accepts parts of it. Server-side only.
 */
import { db } from "../db";
import { analyse as realAnalyse, researchPrompt } from "./analyse";
import { collectMaterial, type NetDeps } from "./sources";
import type { ResearchRun } from "./types";
import { validateReport } from "./validate";

/** Research runs allowed per admin per day (each is a few Wikipedia requests and one AI call). */
export const RESEARCH_PER_DAY = Number(process.env.AI_RESEARCH_PER_DAY || 20);

export const RESEARCH_MIGRATION_MISSING = "গবেষণার টেবিল এখনো তৈরি হয়নি: event_research মাইগ্রেশনটি Supabase-এ চালান।";
const missing = (code?: string) => code === "42P01" || code === "PGRST205";

function fail(error: { code?: string; message: string }): never {
  if (missing(error.code)) throw new Error(RESEARCH_MIGRATION_MISSING);
  throw new Error(`Database: ${error.message}`);
}

/** All research runs of an event, newest first (kept, to compare). */
export async function listRuns(eventId: string): Promise<ResearchRun[]> {
  const { data, error } = await db().from("historical_event_research").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(50);
  if (error) {
    if (missing(error.code)) return [];
    fail(error);
  }
  return (data ?? []) as ResearchRun[];
}

export async function getRun(eventId: string, runId: string): Promise<ResearchRun | undefined> {
  const { data, error } = await db().from("historical_event_research").select("*").eq("id", runId).eq("event_id", eventId).maybeSingle();
  if (error) fail(error);
  return (data ?? undefined) as ResearchRun | undefined;
}

async function update(id: string, patch: Partial<ResearchRun>): Promise<void> {
  const { error } = await db().from("historical_event_research").update(patch).eq("id", id);
  if (error) fail(error);
}

/** How many research runs this admin started in the last 24 hours. */
async function runsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db().from("generation_log").select("id", { count: "exact", head: true }).eq("visitor", `admin:${userId}`).like("place_key", "research:%").gte("created_at", since);
  return count ?? 0;
}

export type Progress =
  | { type: "stage"; stage: "collecting" | "analysing" | "checking"; message: string }
  | { type: "sources"; run: ResearchRun }
  | { type: "done"; run: ResearchRun }
  | { type: "error"; message: string; run?: ResearchRun };

/**
 * Starts a new run (a separate record; earlier runs are kept) and reports progress. The AI and
 * network can be replaced in tests.
 */
export async function runResearch(
  eventId: string,
  userId: string,
  input: { title: string; context?: string; urls?: string[] },
  onProgress: (p: Progress) => void,
  deps: NetDeps & { analyse?: typeof realAnalyse; wikidata?: Parameters<typeof collectMaterial>[1] extends infer D ? (D extends { wikidata?: infer W } ? W : never) : never; signal?: AbortSignal } = {},
): Promise<void> {
  if ((await runsToday(userId)) >= RESEARCH_PER_DAY) {
    onProgress({ type: "error", message: `আজকের গবেষণার সীমা (${RESEARCH_PER_DAY}টি) শেষ। কাল আবার চেষ্টা করুন।` });
    return;
  }
  const { data: created, error } = await db()
    .from("historical_event_research")
    .insert({ event_id: eventId, status: "collecting", input, created_by: userId })
    .select("*")
    .single();
  if (error) fail(error);
  const run = created as ResearchRun;
  await db().from("generation_log").insert({ visitor: `admin:${userId}`, place_key: `research:${eventId}` });

  // 1. Sources (each provider may fail on its own; the run keeps what it got).
  onProgress({ type: "stage", stage: "collecting", message: "সূত্র সংগ্রহ করা হচ্ছে: উইকিপিডিয়া, উইকিডেটা ও আপনার দেওয়া লিংক…" });
  const material = await collectMaterial(input, deps);
  await update(run.id, { sources: material.sources, leads: material.leads, status: "analysing", error: material.problems.join(" · ") || null });
  const withSources = { ...run, sources: material.sources, leads: material.leads, status: "analysing" as const };
  onProgress({ type: "sources", run: withSources });

  if (!material.sources.some((s) => s.retrieval === "retrieved")) {
    const message = "কোনো সূত্র থেকে লেখা আনা যায়নি, তাই বিশ্লেষণ করা হয়নি। অন্য শিরোনাম বা নিজের লিংক দিয়ে আবার চেষ্টা করুন।";
    await update(run.id, { status: "failed", error: message });
    onProgress({ type: "error", message, run: { ...withSources, status: "failed", error: message } });
    return;
  }

  // 2. AI analysis.
  onProgress({ type: "stage", stage: "analysing", message: "AI সংগৃহীত লেখা বিশ্লেষণ করছে…" });
  let raw: { text: string; model: string };
  try {
    raw = await (deps.analyse ?? realAnalyse)(researchPrompt(input, material.sources, material.wikidata), deps.signal);
  } catch (e) {
    const message = /RESOURCE_EXHAUSTED|429|quota/i.test(String(e))
      ? "AI-এর আজকের সীমা শেষ। সংগৃহীত সূত্রগুলো সংরক্ষিত আছে; পরে আবার চালান।"
      : "AI বিশ্লেষণ করতে পারেনি। সংগৃহীত সূত্রগুলো সংরক্ষিত আছে; আবার চেষ্টা করুন।";
    console.error("research analyse:", e);
    await update(run.id, { status: "failed", error: message });
    onProgress({ type: "error", message, run: { ...withSources, status: "failed", error: message } });
    return;
  }

  // 3. Check the answer.
  onProgress({ type: "stage", stage: "checking", message: "উদ্ধৃতি ও সূত্র মিলিয়ে দেখা হচ্ছে…" });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw.text);
  } catch {
    // not JSON at all
  }
  const report = validateReport(parsed, material.sources);
  if (!report) {
    const message = "AI-এর উত্তর গবেষণা প্রতিবেদনের আকারে ছিল না। সংগৃহীত সূত্রগুলো সংরক্ষিত আছে; আবার চেষ্টা করুন।";
    await update(run.id, { status: "failed", error: message, model: raw.model });
    onProgress({ type: "error", message, run: { ...withSources, status: "failed", error: message, model: raw.model } });
    return;
  }
  await update(run.id, { status: "ready", draft: report, model: raw.model });
  onProgress({ type: "done", run: { ...withSources, status: "ready", draft: report, model: raw.model } });
}
