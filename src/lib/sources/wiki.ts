/**
 * Wikidata facts for a place (coordinates, inception, main image, Commons
 * category), used when picking photos. Server-side only.
 */
import { SITE_URL } from "../site";

// Wikimedia asks automated clients to identify themselves.
export const WIKI_HEADERS = { "User-Agent": `Ondor/0.1 (${SITE_URL}; content drafting tool)` };

export type WikidataInfo = {
  qid: string;
  url: string;
  label: { en?: string; bn?: string };
  coords?: { lat: number; lng: number };
  inceptionYear?: number;
  image?: string;
  commonsCategory?: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: WIKI_HEADERS });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json() as Promise<T>;
}

type Claim = { mainsnak?: { datavalue?: { value: unknown } } };

export async function fetchWikidata(qid: string): Promise<WikidataInfo> {
  const data = await getJson<{
    entities: Record<string, { labels?: Record<string, { value: string }>; claims?: Record<string, Claim[]> }>;
  }>(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const entity = Object.values(data.entities)[0];
  const claim = (p: string) => entity.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
  const coord = claim("P625") as { latitude: number; longitude: number } | undefined;
  const inception = claim("P571") as { time: string } | undefined;
  const year = inception?.time.match(/^([+-]\d+)-/)?.[1];
  return {
    qid,
    url: `https://www.wikidata.org/wiki/${qid}`,
    label: { en: entity.labels?.en?.value, bn: entity.labels?.bn?.value },
    coords: coord ? { lat: coord.latitude, lng: coord.longitude } : undefined,
    inceptionYear: year ? Number(year) : undefined,
    image: claim("P18") as string | undefined,
    commonsCategory: claim("P373") as string | undefined,
  };
}
