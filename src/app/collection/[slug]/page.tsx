import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { publishedCollection } from "@/lib/collections";
import { SITE } from "@/lib/places";
import { inRegion } from "@/lib/region";

/*
 * A collection's own page: /collection/<slug>. Its title, intro and places in order, each linking
 * to the place's page, and a button to see them all on the map. Rendered on first visit, then kept
 * for five minutes (an admin edit shows soon after).
 */
export const dynamicParams = true;
export const revalidate = 300;

const load = cache(async (slug: string) => {
  const c = await publishedCollection(slug).catch((e) => {
    console.error(e);
    return undefined;
  });
  return c ? { ...c, places: c.places.filter((p) => inRegion(p.lat, p.lng)) } : undefined;
});

const bn = (n: number) => n.toLocaleString("bn-BD");

export async function generateMetadata({ params }: PageProps<"/collection/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) return {};
  const url = `/collection/${slug}`;
  const description = c.intro_bn || `${c.title_bn}: ${bn(c.places.length)}টি জায়গা, মানচিত্রে ও ইতিহাসে।`;
  const image = { url: `/og/collection/${slug}`, width: 1200, height: 630, alt: c.title_bn };
  return {
    title: c.title_bn,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "bn_BD", siteName: SITE.name, url, title: c.title_bn, description, images: [image] },
    twitter: { card: "summary_large_image", title: c.title_bn, description, images: [image.url] },
  };
}

export default async function CollectionPage({ params }: PageProps<"/collection/[slug]">) {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) notFound();
  const onMap = `/?collection=${slug}`;
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8 pb-16 md:py-12">
      <Link href="/" className="text-meta font-semibold text-accent hover:text-accent-hover">
        ← মানচিত্রে ফিরুন
      </Link>
      <p className="mt-5 text-meta font-semibold text-accent">সংগ্রহ · {bn(c.places.length)}টি জায়গা</p>
      <h1 className="mt-1 text-display font-bold tracking-tight">{c.title_bn}</h1>
      {c.title_en && <p className="mt-1 text-lead text-muted">{c.title_en}</p>}
      {c.intro_bn && <p className="mt-4 text-body text-ink-2">{c.intro_bn}</p>}
      <Link href={onMap} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-on-accent transition-colors hover:bg-accent-hover">
        মানচিত্রে সব দেখুন →
      </Link>

      <ol className="mt-8 flex flex-col gap-3">
        {c.places.map((p, i) => (
          <li key={p.story_id}>
            <Link
              href={p.slug ? `/place/${p.slug}` : onMap}
              className="flex items-center gap-4 rounded-2xl border border-line bg-card p-3 transition-colors hover:border-accent/50 hover:bg-hover"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-meta font-bold text-on-accent">{bn(i + 1)}</span>
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- a small Commons/YouTube thumbnail
                <img src={p.thumb} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="size-16 shrink-0 rounded-xl bg-accent-soft" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">
                  {p.label} {p.verified && <span className="text-meta font-semibold text-success">✓</span>}
                </span>
                {p.note_bn ? <span className="text-meta text-ink-2">{p.note_bn}</span> : p.line && <span className="text-meta text-muted">{p.line}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </article>
  );
}
