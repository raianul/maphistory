import { PlaceMap, type PinPlace } from "@/components/PlaceMap";
import { builtLabel, getPlaces, SITE } from "@/lib/places";

export default function Home() {
  const places = getPlaces();
  const pins: PinPlace[] = places.map((p) => ({
    slug: p.slug,
    name: p.name.bn,
    nameEn: p.name.en,
    era: p.era,
    tier: p.tier,
    summary: p.summary.bn,
    meta: `${p.city.bn} · ${builtLabel(p)}`,
    lat: p.location.lat,
    lng: p.location.lng,
  }));

  return (
    <>
      <h1 className="sr-only">
        {SITE.name}: {SITE.tagline}
      </h1>
      <PlaceMap places={pins} />
    </>
  );
}
