"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { usePathname } from "next/navigation";

/** The Google Analytics 4 measurement ID (G-…). Not set (e.g. on your own computer): nothing loads. */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/**
 * Google Analytics for visitors' pages. Not on the admin (editors aren't visitors), and only when a
 * measurement ID is configured. Page views follow client-side navigation automatically (GA4's
 * enhanced measurement counts history changes).
 */
export function Analytics() {
  const pathname = usePathname();
  if (!GA_ID || pathname.startsWith("/admin")) return null;
  return <GoogleAnalytics gaId={GA_ID} />;
}
