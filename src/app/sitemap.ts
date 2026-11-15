import type { MetadataRoute } from "next";
import { getPlaces, SITE } from "@/lib/places";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    ...getPlaces()
      .filter((p) => p.status === "published")
      .map((p) => ({
        url: `${SITE.url}/place/${p.slug}`,
        changeFrequency: "monthly" as const,
        priority: p.tier === "featured" ? 0.9 : 0.7,
      })),
  ];
}
