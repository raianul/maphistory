/**
 * Search within the site: the places on the map (pinned, not hidden) and the published events whose
 * name or title matches. Shown above the general map search (which only moves the map). Server-side only.
 */
import { db } from "./db";
import { inRegion } from "./region";

export type SiteHit =
  | { type: "place"; slug: string; name: string; line: string; lat: number; lng: number }
  | { type: "event"; slug: string; name: string; line: string };

const missingColumn = (code?: string) => code === "42703" || code === "PGRST204";

/** Safe inside a PostgREST or()/ilike pattern: no commas, brackets, wildcards or quotes. */
const clean = (q: string) => q.replace(/[,()%*_\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function siteSearch(query: string, limit = 5): Promise<SiteHit[]> {
  const q = clean(query);
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const [places, events] = await Promise.all([
    db()
      .from("stories")
      .select("slug,name_bn,name_en,lat,lng,status,label:story->>name_bn,kind_bn:story->>kind_bn,era:story->>era_label_bn")
      .eq("show_on_map", true)
      .neq("status", "hidden")
      .not("slug", "is", null)
      .or(`name_bn.ilike.${like},name_en.ilike.${like},story->>name_bn.ilike.${like}`)
      .order("views", { ascending: false })
      .limit(limit),
    db().from("historical_events").select("slug,title,event_year,date_label,place_name").eq("status", "published").ilike("title", like).order("event_year", { ascending: false }).limit(limit),
  ]);
  const hits: SiteHit[] = [];
  if (!places.error || !missingColumn(places.error.code)) {
    type P = { slug: string; name_bn: string; name_en: string | null; lat: number; lng: number; label: string | null; kind_bn: string | null; era: string | null };
    for (const p of (places.data ?? []) as unknown as P[]) {
      if (!inRegion(p.lat, p.lng)) continue;
      hits.push({ type: "place", slug: p.slug, name: p.label?.trim() || p.name_bn, line: [p.kind_bn, p.era].filter(Boolean).join(" · "), lat: p.lat, lng: p.lng });
    }
  }
  type E = { slug: string; title: string; event_year: number | null; date_label: string | null; place_name: string | null };
  for (const e of (events.data ?? []) as E[]) {
    hits.push({ type: "event", slug: e.slug, name: e.title, line: [e.date_label || (e.event_year ? e.event_year.toLocaleString("bn-BD", { useGrouping: false }) : ""), e.place_name].filter(Boolean).join(" · ") });
  }
  return hits;
}
