import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PagePanel } from "@/components/PagePanel";
import { PlaceMap } from "@/components/PlaceMap";
import { PlaceStory } from "@/components/PlaceStory";
import { findStoryBySlug, listVideos } from "@/lib/db";
import { getPlace, getPlaces, SITE } from "@/lib/places";
import { curatedSeo, jsonLdText, placeJsonLd, seoTitle, shareImage, storySeo } from "@/lib/seo";
import { isPlaceSlug } from "@/lib/slug";

/*
 * Every place has its own address: /place/<slug>. Opening it shows the map centred on the place
 * with its story open, exactly as clicking it does, and the story is already in the HTML (for
 * search engines and link previews).
 *   - hand-written places (content/): built ahead of time
 *   - AI map stories (database): rendered on first visit, then kept for an hour (an admin edit
 *     refreshes it sooner)
 */
export const dynamicParams = true;
export const revalidate = 3600;

export function generateStaticParams() {
  return getPlaces().map((p) => ({ slug: p.slug }));
}

const curatedSlugs = () => getPlaces().map((p) => p.slug);

/** The place for a slug (once per request: the page and its metadata share it). */
const load = cache(async (slug: string) => {
  if (!isPlaceSlug(slug)) return null;
  const curated = getPlace(slug);
  if (curated) return { curated, seo: curatedSeo(curated) } as const;
  const story = await findStoryBySlug(slug).catch((e) => {
    console.error(e);
    return undefined;
  });
  if (!story) return null;
  const videos = await listVideos(story.id).catch(() => []);
  return { story, videos, seo: storySeo(story, videos) } as const;
});

export async function generateMetadata({ params }: PageProps<"/place/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) return {};
  const { seo } = found;
  const title = seoTitle(seo);
  const url = `/place/${slug}`;
  const image = await shareImage(seo);
  return {
    title: { absolute: title },
    description: seo.description,
    alternates: { canonical: url, languages: { bn: url, "x-default": url } },
    robots: seo.indexable ? undefined : { index: false, follow: true },
    openGraph: {
      type: "article",
      locale: "bn_BD",
      siteName: SITE.name,
      url,
      title,
      description: seo.description,
      images: [{ ...image, alt: seo.name }],
      ...(seo.updated ? { modifiedTime: seo.updated } : {}),
    },
    twitter: { card: "summary_large_image", title, description: seo.description, images: [image.url] },
  };
}

export default async function PlacePage({ params }: PageProps<"/place/[slug]">) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  const jsonLd = <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(placeJsonLd(found.seo, await shareImage(found.seo))) }} />;
  if (found.curated) {
    return (
      <>
        {jsonLd}
        <PlaceMap curated={curatedSlugs()} />
        <PagePanel title={found.curated.name.bn}>
          <PlaceStory place={found.curated} />
        </PagePanel>
      </>
    );
  }
  const { story: s, videos } = found;
  return (
    <>
      {jsonLd}
      <PlaceMap
        curated={curatedSlugs()}
        initialAi={{
          target: { name: s.name_bn, lat: s.lat, lng: s.lng, kind: s.kind ?? undefined, slug },
          place: { id: s.id, slug, story: s.story, image: s.image, model: s.model, status: s.status, verifiedAt: s.verifiedAt, ...(videos.length ? { videos } : {}) },
        }}
      />
    </>
  );
}
