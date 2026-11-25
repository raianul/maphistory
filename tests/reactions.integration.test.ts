/**
 * 👍 / 👎 against a real database and the running app (see the RESEARCH_IT notes in
 * tests/research/workflow.integration.test.ts for the local stack).
 */
import { describe, expect, it } from "vitest";
import { saveStory } from "../src/lib/db";
import { reactionTotals } from "../src/lib/reactions";

const ON = process.env.RESEARCH_IT === "1";
const APP = process.env.RESEARCH_IT_APP;
const run = Date.now().toString(36);

/** One visitor: keeps the cookie the app sets. */
function visitor() {
  let cookie = "";
  return async (slug: string, value?: 1 | -1 | 0) => {
    const r = await fetch(`${APP}/api/reactions/${slug}`, {
      method: value === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: value === undefined ? undefined : JSON.stringify({ value }),
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: r.status, body: (await r.json()) as Record<string, unknown>, set };
  };
}

describe.skipIf(!ON || !APP)("likes and dislikes", () => {
  it("one vote per visitor, likes public, dislikes admin-only", async () => {
    const saved = await saveStory({ name: `vote place ${run}`, lat: 23.76, lng: 90.37 }, {
      story: { name_bn: "ভোট", name_en: `Vote Place ${run}`, summary_bn: "পরীক্ষা।", periods: [] },
      model: "test",
    } as never);
    const slug = saved.slug!;
    const a = visitor();
    const b = visitor();

    expect((await a(slug)).body).toEqual({ likes: 0, mine: 0 });
    const first = await a(slug, 1);
    expect(first.body).toEqual({ likes: 1, mine: 1 });
    expect(first.set).toMatch(/^ondor_v=[0-9a-f-]{36};.*HttpOnly/i);
    // Liking twice is still one like.
    expect((await a(slug, 1)).body).toEqual({ likes: 1, mine: 1 });
    expect((await b(slug, 1)).body).toEqual({ likes: 2, mine: 1 });
    // Switching to 👎: the like goes, and the dislike count is never sent.
    const switched = await b(slug, -1);
    expect(switched.body).toEqual({ likes: 1, mine: -1 });
    expect(switched.body).not.toHaveProperty("dislikes");
    expect((await reactionTotals()).get(slug)).toEqual({ likes: 1, dislikes: 1 });
    // Taking a vote back.
    expect((await a(slug, 0)).body).toEqual({ likes: 0, mine: 0 });
    expect((await reactionTotals()).get(slug)).toEqual({ likes: 0, dislikes: 1 });
    // A hand-written place can be liked too.
    expect((await a("lalbagh-fort", 1)).body).toMatchObject({ mine: 1 });
  });

  it("refuses places that don't exist and bad votes", async () => {
    const a = visitor();
    expect((await a(`no-such-place-${run}`, 1)).status).toBe(404);
    expect((await a("Bad Slug!", 1)).status).toBe(400);
    const r = await fetch(`${APP}/api/reactions/lalbagh-fort`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: 5 }) });
    expect(r.status).toBe(400);
  });
});
