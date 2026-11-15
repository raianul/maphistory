import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { PlaceStory } from "@/components/PlaceStory";
import { getPlace, getPlaces, SITE } from "@/lib/places";

// Only places built from content/ exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getPlaces().map((p) => ({ slug: p.slug }));
}

/** Share images are pre-rendered by `pnpm og` (see scripts/og.ts). */
function ogImage(slug: string) {
  const file = `/og/${slug}.png`;
  return existsSync(join(process.cwd(), "public", file)) ? file : undefined;
}

export async function generateMetadata({ params }: PageProps<"/place/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const place = getPlace(slug);
  if (!place) return {};
  const og = ogImage(slug);
  return {
    title: place.name.bn,
    description: place.summary.bn,
    alternates: { canonical: `/place/${slug}` },
    robots: place.status === "published" ? undefined : { index: false },
    openGraph: {
      title: `${place.name.bn} — ${SITE.name}`,
      description: place.summary.bn,
      url: `/place/${slug}`,
      images: og ? [{ url: og, width: 1200, height: 630 }] : undefined,
    },
  };
}

export default async function PlacePage({ params }: PageProps<"/place/[slug]">) {
  const { slug } = await params;
  const place = getPlace(slug);
  if (!place) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4">
      <Link href="/" className="mt-4 inline-block text-sm font-semibold text-accent">
        ← মানচিত্রে দেখুন
      </Link>
      <PlaceStory place={place} />
      <footer className="border-t border-line py-6 text-sm text-muted">
        তথ্য ও ছবি উন্মুক্ত উৎস থেকে নেওয়া; সূত্র ওপরে দেওয়া আছে।
      </footer>
    </div>
  );
}
