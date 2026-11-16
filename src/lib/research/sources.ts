/**
 * Collecting research material for an event, from real, retrievable sources only:
 *   - Wikipedia (English and Bangla), through the official API: the article's plain text. A
 *     starting point, not the final authority.
 *   - Its external references: listed as LEADS ("found, not retrieved") for the admin to open.
 *   - Wikidata: the article's item (date, coordinates) as structured hints.
 *   - URLs the admin pasted: fetched through safeFetch (SSRF-safe), kept only if retrieved.
 * A source is "retrieved" only if its text was actually fetched; its stored excerpt is what the
 * AI saw, so every quote can be checked against it. Whole pages are never stored. Server-side only.
 */
import { fetchWikidata, WIKI_HEADERS } from "../sources/wiki";
import { safeFetch } from "./fetch";
import type { ResearchLead, ResearchSource } from "./types";

export type { ResearchLead, ResearchSource };

/** Injectable network functions (tests pass fakes). */
export type NetDeps = { fetch?: typeof fetch; resolve?: NonNullable<Parameters<typeof safeFetch>[1]>["resolve"] };

/** How much of each source the AI reads, and the stored excerpt it can quote from. */
export const EXCERPT_CHARS = 12_000;
const MAX_LEADS = 40;
const MAX_ADMIN_URLS = 5;

export type WikidataHints = { qid: string; url: string; inceptionYear?: number; coords?: { lat: number; lng: number } };

export type CollectedMaterial = { sources: ResearchSource[]; leads: ResearchLead[]; wikidata: WikidataHints[] };

type WikiPage = { title: string; extract?: string; fullurl?: string; touched?: string; pageprops?: { wikibase_item?: string }; missing?: boolean };

async function wikiApi<T>(lang: "en" | "bn", params: Record<string, string>, fetchImpl: typeof fetch): Promise<T> {
  const q = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await fetchImpl(`https://${lang}.wikipedia.org/w/api.php?${q}`, { headers: WIKI_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Wikipedia ${lang}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** The best Wikipedia article for a query (by the wiki's own search), with its text and references. */
async function wikipediaArticle(lang: "en" | "bn", query: string, fetchImpl: typeof fetch): Promise<{ source: ResearchSource; leads: ResearchLead[]; qid?: string } | null> {
  const search = await wikiApi<{ query?: { search?: { title: string }[] } }>(lang, { action: "query", list: "search", srsearch: query, srlimit: "1" }, fetchImpl);
  const title = search.query?.search?.[0]?.title;
  if (!title) return null;
  return wikipediaByTitle(lang, title, fetchImpl);
}

/**
 * A Wikipedia link (en/bn) read through the API as plain text (no menus, no footnote markers),
 * or null when the link isn't a Wikipedia article or the article doesn't exist.
 */
export async function wikipediaFromUrl(url: string, fetchImpl: typeof fetch = fetch, maxChars = EXCERPT_CHARS): Promise<ResearchSource | null> {
  const m = /^https?:\/\/(en|bn)(?:\.m)?\.wikipedia\.org\/wiki\/([^?#]+)/i.exec(url.trim());
  if (!m) return null;
  let title: string;
  try {
    title = decodeURIComponent(m[2]).replace(/_/g, " ");
  } catch {
    return null;
  }
  const r = await wikipediaByTitle(m[1].toLowerCase() as "en" | "bn", title, fetchImpl, maxChars).catch(() => null);
  return r?.source ?? null;
}

async function wikipediaByTitle(lang: "en" | "bn", title: string, fetchImpl: typeof fetch, maxChars = EXCERPT_CHARS): Promise<{ source: ResearchSource; leads: ResearchLead[]; qid?: string } | null> {
  const data = await wikiApi<{ query?: { pages?: WikiPage[] } }>(
    lang,
    { action: "query", prop: "extracts|pageprops|info|extlinks", explaintext: "1", exsectionformat: "plain", inprop: "url", ellimit: String(MAX_LEADS), redirects: "1", titles: title },
    fetchImpl,
  );
  const page = data.query?.pages?.[0] as (WikiPage & { extlinks?: { url: string }[] }) | undefined;
  const now = new Date().toISOString();
  if (!page || page.missing || !page.extract) return null;
  const url = page.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  return {
    source: {
      id: "",
      title: `${page.title} — Wikipedia (${lang === "bn" ? "বাংলা" : "English"})`,
      url,
      publisher: "Wikipedia",
      author: null,
      published_on: page.touched ? `সর্বশেষ সম্পাদনা ${page.touched.slice(0, 10)}` : null,
      source_type: "encyclopedia",
      origin: "wikipedia",
      language: lang,
      retrieval: "retrieved",
      excerpt: page.extract.slice(0, maxChars),
      retrieved_at: now,
    },
    leads: (page.extlinks ?? [])
      .map((l) => l.url)
      .filter((u) => /^https?:\/\//.test(u) && !/wikipedia\.org|wikimedia\.org|wikidata\.org|archive\.org\/web\/\d+\/https?:\/\/[a-z]+\.wikipedia/.test(u))
      .slice(0, MAX_LEADS)
      .map((u) => ({ url: u, found_in: url, label: null })),
    qid: page.pageprops?.wikibase_item,
  };
}

/** A pasted URL, fetched safely. Failed ones are kept with their reason (never as evidence). */
async function adminUrl(raw: string, deps: NetDeps): Promise<ResearchSource> {
  const r = await safeFetch(raw, deps);
  const now = new Date().toISOString();
  let host = "";
  try {
    host = new URL(r.url).hostname.replace(/^www\./, "");
  } catch {
    // unparsable: urlProblem already said why
  }
  if (!r.ok) {
    return { id: "", title: raw.slice(0, 300), url: raw.slice(0, 2000), publisher: host, author: null, published_on: null, source_type: "other", origin: "admin_url", language: "", retrieval: "failed", reason: r.reason, retrieved_at: now };
  }
  return {
    id: "",
    title: (r.title || host).slice(0, 300),
    url: r.url,
    publisher: host,
    author: null,
    published_on: null,
    source_type: /\.gov\.|\.gov$/.test(host) ? "government" : /\.edu|\.ac\./.test(host) ? "academic" : "article",
    origin: "admin_url",
    language: /[ঀ-৿]/.test(r.text.slice(0, 2000)) ? "bn" : "en",
    retrieval: "retrieved",
    excerpt: r.text.slice(0, EXCERPT_CHARS),
    retrieved_at: now,
  };
}

/**
 * Gathers material for a research run. Each provider may fail on its own; the run keeps what it
 * got. Ids S1, S2 … are given in order: Wikipedia first, then the admin's URLs.
 */
export async function collectMaterial(
  input: { title: string; context?: string; urls?: string[] },
  deps: NetDeps & { wikidata?: typeof fetchWikidata } = {},
): Promise<CollectedMaterial & { problems: string[] }> {
  const fetchImpl = deps.fetch ?? fetch;
  const problems: string[] = [];
  const query = [input.title, input.context].filter(Boolean).join(" ").slice(0, 200);

  const wiki = await Promise.all(
    (["en", "bn"] as const).map((lang) =>
      wikipediaArticle(lang, lang === "bn" ? input.title : query, fetchImpl).catch((e) => {
        problems.push(`Wikipedia (${lang}) not found: ${(e as Error).message}`);
        return null;
      }),
    ),
  );
  const urls = [...new Set((input.urls ?? []).map((u) => u.trim()).filter(Boolean))].slice(0, MAX_ADMIN_URLS);
  const pasted = await Promise.all(urls.map((u) => adminUrl(u, { fetch: deps.fetch, resolve: deps.resolve })));

  const sources = [...wiki.flatMap((w) => (w ? [w.source] : [])), ...pasted].map((s, i) => ({ ...s, id: `S${i + 1}` }));
  const seen = new Set(sources.map((s) => s.url));
  const leads: ResearchLead[] = [];
  for (const w of wiki) {
    for (const l of w?.leads ?? []) {
      if (seen.has(l.url)) continue;
      seen.add(l.url);
      leads.push(l);
    }
  }

  // Wikidata: structured hints only (a date or coordinates to check against, never applied as is).
  const getWikidata = deps.wikidata ?? fetchWikidata;
  const qids = [...new Set(wiki.flatMap((w) => (w?.qid ? [w.qid] : [])))];
  const wikidata = (
    await Promise.all(
      qids.map((q) =>
        getWikidata(q)
          .then((d): WikidataHints => ({ qid: d.qid, url: d.url, inceptionYear: d.inceptionYear, coords: d.coords }))
          .catch(() => {
            problems.push(`Wikidata ${q} not found`);
            return null;
          }),
      ),
    )
  ).filter((x): x is WikidataHints => !!x);

  if (!sources.some((s) => s.retrieval === "retrieved")) problems.push("Couldn't get text from any source");
  return { sources, leads, wikidata, problems };
}
