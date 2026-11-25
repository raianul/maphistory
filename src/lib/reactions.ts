/**
 * 👍 / 👎 on place pages (/place/<slug>): one vote per visitor per place. A visitor is a random id
 * in a cookie, stored only hashed. Visitors see the number of likes; dislikes are for the admin.
 * Server-side only.
 */
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { getPlace } from "./places";

export type Reaction = 1 | -1 | 0;
export type PublicReactions = { likes: number; mine: Reaction };

/** The cookie that tells visitors apart (random, no personal data). */
export const VISITOR_COOKIE = "ondor_v";

/** A new visitor id for the cookie. */
export const newVisitorToken = () => randomUUID();

/** The stored form of a visitor's cookie id: hashed, so the database never holds the cookie itself. */
export function visitorKey(token: string): string {
  const salt = process.env.VISITOR_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createHash("sha256").update(`reaction:${salt}:${token}`).digest("hex").slice(0, 32);
}

/** Whether a slug is a place page: a hand-written place or a saved map story. */
export async function isPlacePage(slug: string): Promise<boolean> {
  if (getPlace(slug)) return true;
  const { data } = await db().from("stories").select("id").eq("slug", slug).neq("status", "hidden").maybeSingle();
  return !!data;
}

/** The like count of a place and this visitor's own vote. */
export async function readReactions(slug: string, visitor?: string): Promise<PublicReactions> {
  const [totals, mine] = await Promise.all([
    db().from("place_reaction_totals").select("likes").eq("slug", slug).maybeSingle(),
    visitor ? db().from("place_reactions").select("value").eq("slug", slug).eq("visitor", visitor).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (totals.error) throw new Error(`Database: ${totals.error.message}`);
  return { likes: totals.data?.likes ?? 0, mine: ((mine.data?.value as Reaction | undefined) ?? 0) as Reaction };
}

/** Sets (1 / -1) or takes back (0) a visitor's vote on a place. */
export async function setReaction(slug: string, visitor: string, value: Reaction): Promise<void> {
  const { error } =
    value === 0
      ? await db().from("place_reactions").delete().eq("slug", slug).eq("visitor", visitor)
      : await db().from("place_reactions").upsert({ slug, visitor, value }, { onConflict: "slug,visitor" });
  if (error) throw new Error(`Database: ${error.message}`);
}

/** Likes and dislikes by slug, for the admin. Empty before the reactions migration. */
export async function reactionTotals(): Promise<Map<string, { likes: number; dislikes: number }>> {
  const { data, error } = await db().from("place_reaction_totals").select("slug,likes,dislikes");
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.slug as string, { likes: r.likes as number, dislikes: r.dislikes as number }]));
}
