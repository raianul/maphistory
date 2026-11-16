/** The research fetcher: SSRF protection, redirects, size/type limits, HTML to text. */
import { describe, expect, it } from "vitest";
import { htmlToText, isPublicAddress, safeFetch, urlProblem } from "../../src/lib/research/fetch";

const publicDns = (async () => [{ address: "93.184.215.14", family: 4 }]) as never;
const dnsTo = (address: string) => (async () => [{ address, family: address.includes(":") ? 6 : 4 }]) as never;
const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  (async () => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } })) as unknown as typeof fetch;
const LONG = "<html><head><title>A history</title></head><body><p>" + "The Language Movement was a political movement in East Bengal. ".repeat(10) + "</p></body></html>";

describe("isPublicAddress", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1"])("%s is not public", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(["93.184.215.14", "8.8.8.8", "2606:4700::1111"])("%s is public", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe("urlProblem", () => {
  it.each(["file:///etc/passwd", "ftp://example.org/x", "javascript:alert(1)", "http://localhost/x", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://user:pw@example.org/", "http://example.org:6379/", "http://svc.internal/", "not a url"])(
    "refuses %s",
    (u) => expect(urlProblem(u)).not.toBeNull(),
  );
  it("accepts a normal public https URL", () => expect(urlProblem("https://en.banglapedia.org/index.php/Language_Movement")).toBeNull());
});

describe("safeFetch", () => {
  it("retrieves a public page as plain text with its title", async () => {
    const r = await safeFetch("https://example.org/a", { fetch: html(LONG), resolve: publicDns });
    expect(r.ok && r.title).toBe("A history");
    expect(r.ok && r.text).toContain("Language Movement");
  });
  it("refuses a host that resolves to a private address (DNS rebinding style)", async () => {
    const r = await safeFetch("https://innocent.example/", { fetch: html(LONG), resolve: dnsTo("10.1.2.3") });
    expect(r).toMatchObject({ ok: false });
  });
  it("re-checks every redirect hop (redirect to the cloud metadata address is refused)", async () => {
    const f = (async () => new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })) as unknown as typeof fetch;
    const r = await safeFetch("https://example.org/r", { fetch: f, resolve: publicDns });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/রিডাইরেক্ট বাতিল/);
  });
  it("stops after too many redirects", async () => {
    const f = (async (u: string) => new Response("", { status: 302, headers: { location: `${u}x` } })) as unknown as typeof fetch;
    expect((await safeFetch("https://example.org/r", { fetch: f, resolve: publicDns })).ok).toBe(false);
  });
  it("reports HTTP errors, non-text types, oversize bodies and near-empty pages without throwing", async () => {
    expect(await safeFetch("https://example.org/", { fetch: html(LONG, 404), resolve: publicDns })).toMatchObject({ ok: false, reason: expect.stringMatching(/404/) });
    expect(await safeFetch("https://example.org/", { fetch: html(LONG, 200, { "content-type": "application/pdf" }), resolve: publicDns })).toMatchObject({ ok: false });
    expect(await safeFetch("https://example.org/", { fetch: html(LONG, 200, { "content-length": "99999999" }), resolve: publicDns })).toMatchObject({ ok: false, reason: "পাতাটি খুব বড়" });
    expect(await safeFetch("https://example.org/", { fetch: html("<p>hi</p>"), resolve: publicDns })).toMatchObject({ ok: false });
  });
  it("turns a network failure into a reason, not an exception", async () => {
    const f = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await safeFetch("https://example.org/", { fetch: f, resolve: publicDns })).toMatchObject({ ok: false, reason: "পাতাটি আনা যায়নি" });
  });
});

describe("htmlToText", () => {
  it("removes scripts, styles and tags; keeps the words", () => {
    const { text } = htmlToText('<script>alert("x")</script><style>p{}</style><p>Hello &amp; welcome</p><div>Next</div>');
    expect(text).not.toMatch(/alert|p\{\}/);
    expect(text).toContain("Hello & welcome");
    expect(text).toContain("Next");
  });
});
