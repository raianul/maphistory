/**
 * Finds any place, road or river in the world by name, using Photon
 * (free OpenStreetMap search, https://photon.komoot.io). Runs in the browser.
 */

export type GeoResult = {
  name: string;
  lat: number;
  lng: number;
  /** For the AI prompt and photo radius, e.g. "suburb", "road or street (secondary)". */
  kind: string;
  /** Short Bangla label for the result list, e.g. "এলাকা", "সড়ক". */
  kindBn: string;
  /** Where it is, e.g. "ঢাকা" or "সৈয়দপুর উপজেলা, নীলফামারী". */
  context: string;
  /** How far to zoom when flying there. */
  zoom: number;
};


type Feature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    osm_key: string;
    osm_value: string;
    countrycode?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

function describe(key: string, value: string): { kind: string; kindBn: string; zoom: number } {
  if (key === "place") {
    if (value === "city") return { kind: "city", kindBn: "শহর", zoom: 12 };
    if (value === "town") return { kind: "town", kindBn: "শহর", zoom: 13 };
    if (value === "village" || value === "hamlet") return { kind: value, kindBn: "গ্রাম", zoom: 14.5 };
    return { kind: value, kindBn: "এলাকা", zoom: 15 };
  }
  if (key === "boundary") return { kind: "district", kindBn: "প্রশাসনিক এলাকা", zoom: 12 };
  if (key === "highway") return { kind: `road or street (${value})`, kindBn: "সড়ক", zoom: 16 };
  if (key === "waterway") return { kind: `river, canal or lake (${value})`, kindBn: "নদী/খাল", zoom: 13 };
  if (key === "water" || (key === "natural" && value === "water")) return { kind: `river, canal or lake (${value})`, kindBn: "জলাশয়", zoom: 15 };
  if (value === "place_of_worship") return { kind: value, kindBn: "উপাসনালয়", zoom: 17 };
  if (key === "historic") return { kind: `historic ${value}`, kindBn: "ঐতিহাসিক স্থাপনা", zoom: 17 };
  if (value === "ferry_terminal") return { kind: value, kindBn: "ঘাট", zoom: 16 };
  if (["school", "college", "university"].includes(value)) return { kind: value, kindBn: "শিক্ষাপ্রতিষ্ঠান", zoom: 16 };
  if (key === "building" || key === "amenity" || key === "tourism") return { kind: value, kindBn: "স্থাপনা", zoom: 17 };
  return { kind: value, kindBn: "জায়গা", zoom: 15 };
}

/**
 * Up to `limit` matches anywhere, duplicates removed. `near` biases
 * the ranking towards a point (used to find a place mentioned in a story).
 */
export async function searchPlaces(
  query: string,
  { near, limit = 6, signal }: { near?: { lat: number; lng: number }; limit?: number; signal?: AbortSignal } = {},
): Promise<GeoResult[]> {
  const ask = async (lang: string) => {
    const params = new URLSearchParams({ q: query, limit: "12", lang });
    if (near) {
      params.set("lat", String(near.lat));
      params.set("lon", String(near.lng));
    }
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    return ((await res.json()) as { features?: Feature[] }).features ?? [];
  };
  // "default" gives the local name: Bangla in Bangladesh, but Cyrillic, Arabic, Chinese … elsewhere,
  // which Bangla readers may not read. So English names are fetched too and used outside Bangladesh.
  // Either search alone is enough (Photon's free server sometimes answers 503 under load);
  // only when both fail is there nothing to show.
  const [localResult, englishResult] = await Promise.allSettled([ask("default"), ask("en")]);
  if (localResult.status === "rejected" && englishResult.status === "rejected") throw localResult.reason;
  const local = localResult.status === "fulfilled" ? localResult.value : [];
  const english = englishResult.status === "fulfilled" ? englishResult.value : [];
  const idOf = (f: Feature) => `${f.properties.osm_type}${f.properties.osm_id}`;
  const localById = new Map(local.map((f) => [idOf(f), f]));
  const englishById = new Map(english.map((f) => [idOf(f), f]));
  // The ranking comes from the search in the query's own language: typed in Bangla → local names
  // ("সদরঘাট"); typed in Latin letters → English names, so "Colosseum" finds Rome's Colosseum
  // (locally "Colosseo") before places literally named Colosseum.
  const primary = /[ঀ-৿]/.test(query) ? (local.length ? local : english) : english.length ? english : local;
  const data = {
    features: primary.map((f) => {
      // Shown: the Bangla name in Bangladesh, the English one elsewhere.
      const shown = f.properties.countrycode === "BD" ? (localById.get(idOf(f)) ?? f) : (englishById.get(idOf(f)) ?? f);
      return { ...f, properties: { ...f.properties, ...shown.properties, name: shown.properties.name ?? f.properties.name } };
    }),
  };
  const seen = new Set<string>();
  const out: GeoResult[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (!p.name) continue;
    const d = describe(p.osm_key, p.osm_value);
    // "Rome, Lazio, Italy": with the whole world searchable, the country tells same-named places apart.
    // Bangladeshi results keep their Bangla context and leave out the obvious country.
    const context = [p.city ?? p.district ?? p.county, p.state, p.countrycode === "BD" ? undefined : p.country]
      .filter((x, i, a) => x && a.indexOf(x) === i)
      .join(", ");
    // The same road comes back once per segment: keep one per name, kind and town.
    const key = `${p.name}|${d.kindBn}|${context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lng, lat] = f.geometry.coordinates;
    out.push({ name: p.name, lat, lng, context, ...d });
  }
  // A road often carries the name of the landmark it leads to ("Colosseum" is also a footpath in
  // Rome): when a road and something else share a name and place, the landmark comes first.
  const landmark = new Set(out.filter((r) => r.kindBn !== "সড়ক").map((r) => `${r.name}|${r.context}`));
  const isShadowRoad = (r: GeoResult) => r.kindBn === "সড়ক" && landmark.has(`${r.name}|${r.context}`);
  return [...out.filter((r) => !isShadowRoad(r)), ...out.filter(isShadowRoad)].slice(0, limit);
}
