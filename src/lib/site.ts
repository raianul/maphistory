/**
 * The site's public address, set in ONE place: NEXT_PUBLIC_SITE_URL (e.g. https://www.placeandpast.com).
 * Canonical URLs, share links, the sitemap, share cards and structured data all use it.
 * Client-safe (no content data imported).
 *
 * Unset: Vercel's production address (which Vercel provides to every build), then localhost.
 */
const configured =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

export const SITE_URL = (configured || "http://localhost:3000").replace(/\/+$/, "");

/**
 * The full public address of a path ("/place/lalbagh-fort" → "https://www.placeandpast.com/place/lalbagh-fort").
 * With nothing configured (your own computer), the address the browser is on.
 */
export function siteUrl(path: string): string {
  const base = configured ? SITE_URL : typeof window !== "undefined" ? window.location.origin : SITE_URL;
  return new URL(path, `${base}/`).toString();
}
