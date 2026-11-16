import { PlaceMap } from "@/components/PlaceMap";
import { SITE } from "@/lib/places";

// A static page: the map loads its pins itself, square by square, from /api/pins/z/x/y.
export default function Home() {
  return (
    <>
      <h1 className="sr-only">
        {SITE.name}: {SITE.tagline}
      </h1>
      <PlaceMap />
    </>
  );
}
