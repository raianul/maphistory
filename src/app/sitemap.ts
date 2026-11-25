import type { MetadataRoute } from "next";
import { publishedCollections } from "@/lib/collections";
import { listPlacePages } from "@/lib/db";
import { getPlaces, SITE } from "@/lib/places";

// Rebuilt at most hourly, so new pinned places show up without a deploy.
export const revalidate = 3600;

/**
 * Every page search engines should know: home, About, Privacy, the published hand-written places,
 * the collections and the places pinned on the map. Unpinned AI places have pages too, but those are noindex.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const curated = getPlaces().filter((p) => p.status === "published");
  const curatedSlugs = new Set(getPlaces().map((p) => p.slug));
  const stories = (await listPlacePages().catch(() => [])).filter((s) => s.show_on_map && !curatedSlugs.has(s.slug));
  const collections = await publishedCollections().catch(() => []);
  const newest = stories.reduce((max, s) => (s.updated_at > max ? s.updated_at : max), "");
  return [
    { url: SITE.url, ...(newest ? { lastModified: new Date(newest) } : {}), changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    ...collections.map((c) => ({ url: `${SITE.url}/collection/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...curated.map((p) => ({ url: `${SITE.url}/place/${p.slug}`, changeFrequency: "monthly" as const, priority: p.tier === "featured" ? 0.9 : 0.7 })),
    ...stories.map((s) => ({ url: `${SITE.url}/place/${s.slug}`, lastModified: new Date(s.updated_at), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
