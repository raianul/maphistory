/** Collecting research material: Wikipedia text, references as leads, pasted URLs, failures. */
import { describe, expect, it } from "vitest";
import { collectMaterial } from "../../src/lib/research/sources";

const ARTICLE = "On 21 February 1952 students in Dhaka marched for Bengali to be a state language. ".repeat(20);
/** A fake Wikipedia API plus fake pages for pasted URLs. */
function fakeNet(opts: { wikiDown?: boolean; pages?: Record<string, { status?: number; body: string; type?: string }> } = {}) {
  return (async (input: string) => {
    const u = new URL(input);
    if (u.hostname.endsWith("wikipedia.org")) {
      if (opts.wikiDown) return new Response("down", { status: 503 });
      const p = u.searchParams;
      if (p.get("list") === "search") return Response.json({ query: { search: [{ title: u.hostname.startsWith("bn") ? "ভাষা আন্দোলন" : "Bengali language movement" }] } });
      return Response.json({
        query: {
          pages: [
            {
              title: p.get("titles"),
              extract: ARTICLE,
              fullurl: `https://${u.hostname}/wiki/X`,
              touched: "2026-10-01T00:00:00Z",
              pageprops: { wikibase_item: "Q1975418" },
              extlinks: [{ url: "http://countrystudies.us/bangladesh/14.htm" }, { url: "https://en.wikipedia.org/wiki/Other" }, { url: "http://countrystudies.us/bangladesh/14.htm" }],
            },
          ],
        },
      });
    }
    const page = opts.pages?.[input];
    if (!page) return new Response("nope", { status: 404 });
    return new Response(page.body, { status: page.status ?? 200, headers: { "content-type": page.type ?? "text/html" } });
  }) as unknown as typeof fetch;
}
const resolve = (async () => [{ address: "93.184.215.14", family: 4 }]) as never;
const wikidata = (async (q: string) => ({ qid: q, url: `https://www.wikidata.org/wiki/${q}`, label: {}, inceptionYear: 1952 })) as never;

describe("collectMaterial", () => {
  it("retrieves Wikipedia (en + bn), numbers sources, turns references into leads (deduplicated, not retrieved)", async () => {
    const m = await collectMaterial({ title: "ভাষা আন্দোলন" }, { fetch: fakeNet(), resolve, wikidata });
    expect(m.sources.map((s) => s.id)).toEqual(["S1", "S2"]);
    expect(m.sources.every((s) => s.retrieval === "retrieved" && s.excerpt!.length > 0)).toBe(true);
    expect(m.leads.map((l) => l.url)).toEqual(["http://countrystudies.us/bangladesh/14.htm"]); // wikipedia links and duplicates dropped
    expect(m.wikidata[0]).toMatchObject({ qid: "Q1975418", inceptionYear: 1952 });
  });

  it("keeps a pasted URL that could be retrieved, and records one that couldn't (with the reason, never as evidence)", async () => {
    const good = "https://archive.example.org/doc";
    const m = await collectMaterial(
      { title: "x", urls: [good, "https://gone.example.org/404", "http://169.254.169.254/latest", "  " + good] },
      { fetch: fakeNet({ pages: { [good]: { body: `<title>Archive doc</title><p>${ARTICLE}</p>` } } }), resolve, wikidata },
    );
    const pasted = m.sources.filter((s) => s.origin === "admin_url");
    expect(pasted).toHaveLength(3); // duplicate URL collapsed
    expect(pasted.find((s) => s.url === good)).toMatchObject({ retrieval: "retrieved", title: "Archive doc" });
    expect(pasted.find((s) => s.url.includes("gone"))).toMatchObject({ retrieval: "failed", reason: expect.stringMatching(/404/) });
    const meta = pasted.find((s) => s.url.includes("169.254"));
    expect(meta).toMatchObject({ retrieval: "failed" });
    expect(meta?.excerpt).toBeUndefined();
  });

  it("carries on when Wikipedia is down, and says nothing could be retrieved", async () => {
    const m = await collectMaterial({ title: "x" }, { fetch: fakeNet({ wikiDown: true }), resolve, wikidata });
    expect(m.sources).toHaveLength(0);
    expect(m.problems.join(" ")).toMatch(/from any source/);
  });
});
