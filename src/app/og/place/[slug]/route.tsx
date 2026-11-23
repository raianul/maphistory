import { findStoryBySlug } from "@/lib/db";
import { placeCard } from "@/lib/og/card";
import { getPlace } from "@/lib/places";
import { curatedSeo, storySeo } from "@/lib/seo";
import { isPlaceSlug } from "@/lib/slug";

/** The share card of a place (used when it has no video thumbnail): /og/place/<slug>. */
export async function GET(_req: Request, { params }: RouteContext<"/og/place/[slug]">) {
  const { slug } = await params;
  if (!isPlaceSlug(slug)) return new Response("Not found", { status: 404 });
  const curated = getPlace(slug);
  const story = curated ? undefined : await findStoryBySlug(slug).catch(() => undefined);
  const seo = curated ? curatedSeo(curated) : story ? storySeo(story, []) : undefined;
  if (!seo) return new Response("Not found", { status: 404 });
  return placeCard({ name: seo.name, line: seo.line, photo: seo.photo });
}
