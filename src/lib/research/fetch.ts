/**
 * Fetching pages for AI research, safely. Retrieved content is untrusted data. Server-side only.
 *
 *  - http(s) only, standard ports only, no credentials in the URL.
 *  - Every host is resolved first and refused if any of its addresses is private, loopback,
 *    link-local, carrier-grade NAT, multicast or otherwise not public (SSRF). Redirects are
 *    followed by hand (at most 3), and each hop is checked again.
 *  - Time limit per request, size limit on the body (stops reading past it), text-like types only.
 *  - HTML is reduced to plain text (scripts, styles and tags removed); nothing is executed.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { WIKI_HEADERS } from "../sources/wiki";

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const TEXT_TYPES = /^(text\/html|text\/plain|application\/xhtml\+xml|application\/json)/i;

export type FetchResult =
  | { ok: true; url: string; title: string | null; text: string; contentType: string }
  | { ok: false; url: string; reason: string };

/** Whether an IP address is public (not private, loopback, link-local, reserved …). */
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
    if (a === 169 && b === 254) return false; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 192 && b === 0) return false; // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a >= 224) return false; // multicast, reserved, broadcast
    return true;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return false;
    // IPv4-mapped (::ffff:10.0.0.1): judge the IPv4 part.
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^f[cd]/.test(s)) return false; // unique local
    if (/^fe[89ab]/.test(s)) return false; // link-local
    if (/^ff/.test(s)) return false; // multicast
    if (s.startsWith("2001:db8")) return false; // documentation
    return true;
  }
  return false;
}

/** Why a URL may not be fetched, or null if its form is acceptable (addresses are checked separately). */
export function urlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "অবৈধ লিংক";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "শুধু http/https লিংক";
  if (u.username || u.password) return "লিংকে ইউজারনেম/পাসওয়ার্ড চলবে না";
  if (u.port && !["80", "443"].includes(u.port)) return "অস্বাভাবিক পোর্ট";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return "অভ্যন্তরীণ ঠিকানা";
  if (isIP(host) && !isPublicAddress(host)) return "অভ্যন্তরীণ ঠিকানা";
  return null;
}

/** Resolves a host and refuses it unless every address is public. */
async function assertPublicHost(hostname: string, resolve = lookup): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error("অভ্যন্তরীণ ঠিকানা");
    return;
  }
  const addrs = await resolve(host, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => !isPublicAddress(a.address))) throw new Error("অভ্যন্তরীণ ঠিকানা");
}

/** HTML → readable plain text (no scripts/styles; block tags become line breaks; entities decoded). */
export function htmlToText(html: string): { title: string | null; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const body = html
    .replace(/<(script|style|noscript|template|svg|iframe|object|embed)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return { title: title ? decode(title).trim().replace(/\s+/g, " ").slice(0, 300) : null, text: decode(body).replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim() };
}

function decode(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…" };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/** Reads a body up to MAX_BYTES and stops (never buffers an unbounded response). */
async function readLimited(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (declared && declared > MAX_BYTES) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/**
 * Fetches a public page as text, with every protection above. Never throws: failures come back
 * as { ok: false, reason } so research can carry on and show what couldn't be retrieved.
 */
export async function safeFetch(raw: string, deps: { fetch?: typeof fetch; resolve?: typeof lookup } = {}): Promise<FetchResult> {
  const doFetch = deps.fetch ?? fetch;
  let url = raw.trim();
  const problem = urlProblem(url);
  if (problem) return { ok: false, url: raw, reason: problem };
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(new URL(url).hostname, deps.resolve);
      const res = await doFetch(url, {
        redirect: "manual",
        headers: { ...WIKI_HEADERS, Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return { ok: false, url, reason: `রিডাইরেক্ট (${res.status}) কিন্তু গন্তব্য নেই` };
        url = new URL(next, url).toString();
        const p = urlProblem(url);
        if (p) return { ok: false, url, reason: `রিডাইরেক্ট বাতিল: ${p}` };
        continue;
      }
      if (!res.ok) return { ok: false, url, reason: `পাওয়া যায়নি (HTTP ${res.status})` };
      const type = res.headers.get("content-type") ?? "";
      if (!TEXT_TYPES.test(type)) return { ok: false, url, reason: `পড়া যায় এমন লেখা নয় (${type.split(";")[0] || "অজানা ধরন"})` };
      const body = await readLimited(res);
      if (body === null) return { ok: false, url, reason: "পাতাটি খুব বড়" };
      const { title, text } = /html|xml/i.test(type) ? htmlToText(body) : { title: null, text: body };
      if (text.length < 200) return { ok: false, url, reason: "পাতায় পড়ার মতো লেখা প্রায় নেই" };
      return { ok: true, url, title, text, contentType: type.split(";")[0] };
    }
    return { ok: false, url, reason: "অনেকবার রিডাইরেক্ট" };
  } catch (e) {
    const msg = (e as Error).message;
    return { ok: false, url, reason: /অভ্যন্তরীণ/.test(msg) ? msg : /timeout|abort/i.test(msg) ? "সময় শেষ (সাড়া দেয়নি)" : "পাতাটি আনা যায়নি" };
  }
}
