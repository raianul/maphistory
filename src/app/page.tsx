import type { Metadata } from "next";
import { PlaceMap } from "@/components/PlaceMap";
import { getPlaces, SITE } from "@/lib/places";

const title = `বাংলাদেশের প্রতিটি জায়গার ইতিহাস, মানচিত্রে | ${SITE.name}`;
const description = "বাংলাদেশের ইতিহাস, মানচিত্রে: আজকের দিনে কী ঘটেছিল, ধাপে ধাপে সময়রেখা, আর মসজিদ, মন্দির, প্রাসাদ, দুর্গ, স্মৃতিসৌধের মতো ঐতিহাসিক জায়গা, ছবি ও ভিডিও-সহ।";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/", languages: { bn: "/", "x-default": "/" } },
  // Replaces the layout's openGraph as a whole, so all of it is here.
  openGraph: {
    type: "website",
    locale: "bn_BD",
    siteName: SITE.name,
    url: "/",
    title,
    description,
    images: [{ url: "/og/home", width: 1200, height: 630, alt: "বাংলাদেশের প্রতিটি জায়গার ইতিহাস, মানচিত্রে" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og/home"] },
};

// A static page: the map loads its pins itself, square by square, from /api/pins/z/x/y.
export default function Home() {
  return (
    <>
      <h1 className="sr-only">
        {SITE.name}: {SITE.tagline}
      </h1>
      <PlaceMap curated={getPlaces().map((p) => p.slug)} />
    </>
  );
}
