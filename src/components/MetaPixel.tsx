"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";

/**
 * Meta (Facebook) Pixel: page views, for measuring and targeting Facebook ads. Not on the admin.
 * The id is public (it is in every page's source); NEXT_PUBLIC_META_PIXEL_ID="" turns it off.
 */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "30275997411988468";

type Fbq = (...args: unknown[]) => void;

export function MetaPixel() {
  const pathname = usePathname();
  const first = useRef(true);
  // A page view for each page moved to within the site (the first one is sent by the script itself).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pathname.startsWith("/admin")) return;
    (window as unknown as { fbq?: Fbq }).fbq?.("track", "PageView");
  }, [pathname]);
  if (!META_PIXEL_ID || pathname.startsWith("/admin")) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
    </Script>
  );
}
