/**
 * Visitor events for Google Analytics 4 (see components/Analytics.tsx), and keeping campaign tags
 * (utm_*) in the address bar so GA attributes the visit. Client-side only; does nothing when GA
 * isn't configured (NEXT_PUBLIC_GA_ID), e.g. on your own computer.
 *
 * Events:
 *   place_open   { slug?, place_name, source }  source: link · pin · map · nearby · search · explore · on_this_day
 *   video_play   { slug?, video_id }
 *   share_click  { slug?, method }               method: share_sheet · copy_link
 */

type Gtag = (command: "event", name: string, params: Record<string, unknown>) => void;

const GA_ON = !!process.env.NEXT_PUBLIC_GA_ID;

/**
 * Sends an event. GA's script loads after the page is interactive, so an event sent before it (a
 * place opened from a shared link) waits for it, up to 10 seconds.
 */
export function track(name: string, params: Record<string, string | number | undefined | null>) {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return;
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  pixel(name, clean);
  if (!GA_ON) return;
  let tries = 0;
  const send = () => {
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    if (gtag) gtag("event", name, clean);
    else if (tries++ < 40) setTimeout(send, 250);
  };
  send();
}

/** The same moments for the Meta Pixel (Facebook ads): a place opened is "ViewContent"; the rest are custom. */
const PIXEL_EVENTS: Record<string, string> = { place_open: "ViewContent", birthday_lookup: "BirthdayLookup", birthday_share: "BirthdayShare", birthday_download: "BirthdayDownload", collection_open: "CollectionOpen" };
function pixel(name: string, params: Record<string, unknown>) {
  const event = PIXEL_EVENTS[name];
  if (!event) return;
  let tries = 0;
  const send = () => {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (fbq) fbq(event === "ViewContent" ? "track" : "trackCustom", event, event === "ViewContent" ? { content_name: params.place_name, content_category: "place" } : params);
    else if (tries++ < 40) setTimeout(send, 250);
  };
  send();
}

/** The place page's slug in a path or link: "/place/lalbagh-fort?x" → "lalbagh-fort". */
export function slugOf(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, "http://x").pathname.match(/^\/place\/([a-z0-9-]+)/)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * An address with the visit's campaign tags (utm_*) kept: the map rewrites the address bar as
 * places open and close, and GA reads the tags from it. Use for replaceState (the same visit).
 */
export function withCampaign(url: string): string {
  if (typeof window === "undefined") return url;
  const tags = [...new URLSearchParams(window.location.search)].filter(([k]) => k.startsWith("utm_"));
  if (!tags.length) return url;
  const [path, hash = ""] = url.split("#");
  const u = new URL(path, window.location.origin);
  for (const [k, v] of tags) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  return `${u.pathname}${u.search}${hash ? `#${hash}` : ""}`;
}
