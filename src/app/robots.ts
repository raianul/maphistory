import type { MetadataRoute } from "next";
import { SITE } from "@/lib/places";

/** Pages are open to search engines; admin, the API and search/filter states (URLs with ?) are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/demo", "/*?"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
