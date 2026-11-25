import { publishedCollection } from "@/lib/collections";
import { placeCard } from "@/lib/og/card";

const bn = (n: number) => n.toLocaleString("bn-BD");

/** A collection's share card: its title, how many places, over its first place's picture. */
export async function GET(_req: Request, { params }: RouteContext<"/og/collection/[slug]">) {
  const { slug } = await params;
  const c = await publishedCollection(slug).catch(() => undefined);
  if (!c) return new Response("Not found", { status: 404 });
  return placeCard({ name: c.title_bn, line: `সংগ্রহ · ${bn(c.places.length)}টি জায়গা`, photo: c.places.find((p) => p.thumb)?.thumb });
}
