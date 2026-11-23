import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PagePanel } from "@/components/PagePanel";
import { PlaceMap } from "@/components/PlaceMap";
import { PlaceStory } from "@/components/PlaceStory";
import { findStoryBySlug, listVideos } from "@/lib/db";
import { getPlace, getPlaces, SITE } from "@/lib/places";
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

/** Share images of hand-written places are pre-rendered by `pnpm og` (see scripts/og.ts). */
function ogImage(slug: string) {
  const file = `/og/${slug}.png`;
  return existsSync(join(process.cwd(), "public", file)) ? file : undefined;
}

async function load(slug: string) {
  if (!isPlaceSlug(slug)) return null;
  const curated = getPlace(slug);
  if (curated) return { curated } as const;
  const story = await findStoryBySlug(slug).catch((e) => {
    console.error(e);
    return undefined;
  });
  return story ? ({ story } as const) : null;
}

export async function generateMetadata({ params }: PageProps<"/place/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) return {};
  if (found.curated) {
    const place = found.curated;
    const og = ogImage(slug);
    return {
      title: place.name.bn,
      description: place.summary.bn,
      alternates: { canonical: `/place/${slug}` },
      robots: place.status === "published" ? undefined : { index: false },
      openGraph: { title: `${place.name.bn} — ${SITE.name}`, description: place.summary.bn, url: `/place/${slug}`, images: og ? [{ url: og, width: 1200, height: 630 }] : undefined },
    };
  }
  const s = found.story;
  const name = s.story.name_bn || s.name_bn;
  return {
    title: name,
    description: s.story.summary_bn?.slice(0, 155),
    alternates: { canonical: `/place/${slug}` },
    // Only the places pinned on the public map are on search engines; the rest stay shareable.
    robots: s.show_on_map ? undefined : { index: false, follow: true },
  };
}

export default async function PlacePage({ params }: PageProps<"/place/[slug]">) {
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  if (found.curated) {
    return (
      <>
        <PlaceMap curated={curatedSlugs()} />
        <PagePanel title={found.curated.name.bn}>
          <PlaceStory place={found.curated} />
        </PagePanel>
      </>
    );
  }
  const s = found.story;
  const videos = await listVideos(s.id).catch(() => []);
  return (
    <PlaceMap
      curated={curatedSlugs()}
      initialAi={{
        target: { name: s.name_bn, lat: s.lat, lng: s.lng, kind: s.kind ?? undefined, slug },
        place: { id: s.id, slug, story: s.story, image: s.image, model: s.model, status: s.status, ...(videos.length ? { videos } : {}) },
      }}
    />
  );
}
