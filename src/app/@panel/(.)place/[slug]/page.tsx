import { notFound } from "next/navigation";
import { PlaceStory } from "@/components/PlaceStory";
import { SidePanel } from "@/components/SidePanel";
import { getPlace, getPlaces } from "@/lib/places";

/*
 * Clicking a place on the map lands here instead of the full page: the story
 * opens in a panel and the map stays. Opening /place/<slug> directly (search
 * engines, shared links, refresh) still renders the full page.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return getPlaces().map((p) => ({ slug: p.slug }));
}

export default async function PlacePanel({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = getPlace(slug);
  if (!place) notFound();
  return (
    <SidePanel title={place.name.bn}>
      <PlaceStory place={place} />
    </SidePanel>
  );
}
