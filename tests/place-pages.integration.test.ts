/**
 * Place page addresses against a real database and the running app (see the RESEARCH_IT notes in
 * tests/research/workflow.integration.test.ts for the local stack).
 */
import { describe, expect, it } from "vitest";
import { findStory, findStoryBySlug, saveStory } from "../src/lib/db";

const ON = process.env.RESEARCH_IT === "1";
const APP = process.env.RESEARCH_IT_APP;
const run = Date.now().toString(36);
const story = (name_en: string, locality_en?: string) =>
  ({ story: { name_bn: "পরীক্ষা", name_en, locality_en, summary_bn: "পরীক্ষার জায়গা।", periods: [] }, model: "test" }) as never;

describe.skipIf(!ON)("place addresses (database)", () => {
  it("a newly saved story gets its address from its English name", async () => {
    const saved = await saveStory({ name: `test place ${run}`, lat: 23.7, lng: 90.4 }, story(`Test Place ${run}`, "Ramna, Dhaka, Bangladesh"));
    expect(saved.slug).toBe(`test-place-${run}`);
    expect((await findStoryBySlug(saved.slug!))?.name_bn).toBe(`test place ${run}`);
  });
  it("the same English name elsewhere gets its city added; the address never changes", async () => {
    const other = await saveStory({ name: `test place ${run} b`, lat: 22.3, lng: 91.8 }, story(`Test Place ${run}`, "Patenga, Chattogram, Bangladesh"));
    expect(other.slug).toBe(`test-place-${run}-chattogram`);
    const again = await findStory({ name: `test place ${run} b`, lat: 22.3, lng: 91.8 });
    expect(again?.slug).toBe(`test-place-${run}-chattogram`);
  });
  it("never takes a hand-written page's address by accident", async () => {
    const s = await saveStory({ name: `lalbagh ${run}`, lat: 23.719, lng: 90.388 }, story("Lalbagh Fort", "Lalbagh, Dhaka, Bangladesh"));
    expect(s.slug).not.toBe("lalbagh-fort");
    expect(s.slug).toMatch(/^lalbagh-fort-/);
  });
});

describe.skipIf(!ON || !APP)("place pages (HTTP)", () => {
  it("the page's HTML has the name, description, canonical address, share tags and structured data", async () => {
    await saveStory({ name: `html place ${run}`, lat: 23.75, lng: 90.39 }, story(`Html Place ${run}`));
    const html = await (await fetch(`${APP}/place/html-place-${run}`)).text();
    expect(html).toMatch(/<title>পরীক্ষা( — [^<]+)? \| Ondor<\/title>/);
    expect(html).toContain('<meta name="description" content="পরীক্ষার জায়গা।"');
    expect(html).toContain(`/place/html-place-${run}"`);
    expect(html).toContain("noindex"); // not pinned on the map
    expect(html).toContain('<meta property="og:type" content="article"/>');
    expect(html).toContain('<meta property="og:locale" content="bn_BD"/>');
    expect(html).toContain(`<meta property="og:image" content="${APP}/og/place/html-place-${run}"/>`); // no video: the card
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)![1]);
    expect(ld[0]).toMatchObject({ "@type": "TouristAttraction", name: "পরীক্ষা", geo: { latitude: 23.75, longitude: 90.39 } });
    const card = await fetch(`${APP}/og/place/html-place-${run}`);
    expect(card.status).toBe(200);
    expect(card.headers.get("content-type")).toBe("image/png");
  });
  it("an old link moves permanently to the page, keeping campaign tags", async () => {
    const r = await fetch(`${APP}/?place=${encodeURIComponent(`html place ${run}`)}&at=23.75,90.39&utm_source=facebook&fbclid=x`, { redirect: "manual" });
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toMatch(new RegExp(`/place/html-place-${run}\\?utm_source=facebook$`));
  });
  it("an old link to a place with no saved story still opens the map; unknown addresses are 404", async () => {
    expect((await fetch(`${APP}/?place=nowhere-${run}&at=23.7,90.4`, { redirect: "manual" })).status).toBe(200);
    expect((await fetch(`${APP}/place/no-such-place-${run}`)).status).toBe(404);
  });
});
