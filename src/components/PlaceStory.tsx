import Image from "next/image";
import { ActionRow } from "@/components/ActionRow";
import { EraTag } from "@/components/EraTag";
import { bnYear, builtLabel, SITE } from "@/lib/places";
import type { Place, ResolvedImage, StoryBlockT, TextT } from "@/lib/schema";

/**
 * The visual story of one place. Used by the full page (/place/[slug]) and by
 * the side panel that opens over the map. Layout follows the container width,
 * not the screen, so it fits both.
 */
export function PlaceStory({ place }: { place: Place }) {
  const of = <K extends StoryBlockT["kind"]>(kind: K) =>
    place.story.filter((b): b is Extract<StoryBlockT, { kind: K }> => b.kind === kind);
  const stages = of("stage");
  const events = of("event").toSorted((a, b) => a.year - b.year);
  const thenNow = of("then_now");
  const people = of("person");
  const facts = of("fact");

  return (
    <article className="@container pb-16">
      {place.status !== "published" && (
        <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          খসড়া · status: {place.status}. এই পাতা এখনো যাচাই হয়নি, প্রকাশিত সাইটে দেখা যাবে না।
        </p>
      )}

      <header className="pt-6">
        <EraTag era={place.era} />
        <h1 className="mt-3 text-4xl font-bold leading-tight">{place.name.bn}</h1>
        {place.name.en && <p className="text-muted">{place.name.en}</p>}
        <p className="mt-1 text-sm text-muted">
          {place.city.bn} · {builtLabel(place)}
        </p>
      </header>

      {place.hero && (
        <Figure image={place.images[place.hero.image]} alt={place.hero.alt} priority className="mt-6" />
      )}

      <ActionRow title={place.name.bn} url={`/place/${place.slug}`} lat={place.location.lat} lng={place.location.lng} />

      <p className="mt-6 text-lg">{place.summary.bn}</p>

      {place.keyNumbers && (
        <dl className="mt-6 grid grid-cols-2 gap-3 @lg:grid-cols-4">
          {place.keyNumbers.map((k) => (
            <div key={k.label.bn} className="rounded-xl border border-line bg-card p-3">
              <dd className="text-2xl font-bold">{k.value.bn}</dd>
              <dt className="text-sm text-muted">{k.label.bn}</dt>
            </div>
          ))}
        </dl>
      )}

      {stages.length > 0 && (
        <Section title="কীভাবে গড়ে উঠল">
          <ol className="grid gap-6">
            {stages.map((s, i) => (
              <li key={i}>
                <p className="text-sm text-muted">
                  ধাপ {bnYear(i + 1)}
                  {s.year !== undefined && ` · ${bnYear(s.year)}`}
                </p>
                <h3 className="font-semibold">{s.title.bn}</h3>
                {s.image && <Figure image={place.images[s.image.image]} alt={s.image.alt} className="mt-2" />}
                {s.body && <p className="mt-1">{s.body.bn}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {events.length > 0 && (
        <Section title="সময়রেখা">
          <ol className="relative border-s-2 border-line ps-6">
            {events.map((e, i) => (
              <li key={i} className="relative pb-6 last:pb-0">
                <span
                  className="absolute -start-[33px] top-1.5 size-4 rounded-full border-2 border-paper bg-accent"
                  aria-hidden
                />
                <p className="text-sm font-semibold text-accent">{bnYear(e.year)}</p>
                <h3 className="font-semibold">{e.title.bn}</h3>
                {e.body && <p className="mt-1">{e.body.bn}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {thenNow.length > 0 && (
        <Section title="তখন ও এখন">
          {thenNow.map((b, i) => (
            <div key={i} className="grid gap-3 @lg:grid-cols-2">
              <Figure image={place.images[b.then.image]} alt={b.then.alt} label={b.then.year && bnYear(b.then.year)} />
              <Figure image={place.images[b.now.image]} alt={b.now.alt} label={b.now.year && bnYear(b.now.year)} />
            </div>
          ))}
        </Section>
      )}

      {people.length > 0 && (
        <Section title="যাঁদের গল্প">
          <ul className="grid gap-3 @lg:grid-cols-2">
            {people.map((p, i) => (
              <li key={i} className="rounded-xl border border-line bg-card p-4">
                <h3 className="font-semibold">{p.title.bn}</h3>
                {p.body && <p className="mt-1 text-sm">{p.body.bn}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {facts.length > 0 && (
        <Section title="জানা দরকার">
          <ul className="grid gap-3">
            {facts.map((f, i) => (
              <li key={i}>
                <h3 className="font-semibold">{f.title.bn}</h3>
                {f.body && <p>{f.body.bn}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Sources place={place} />
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Figure({
  image,
  alt,
  label,
  priority,
  className = "",
}: {
  image: ResolvedImage | undefined;
  alt: TextT;
  label?: string | 0;
  priority?: boolean;
  className?: string;
}) {
  if (!image) return null;
  return (
    <figure className={className}>
      <div className="relative">
        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt={alt.bn}
          priority={priority}
          sizes="(min-width: 768px) 720px, 100vw"
          className="h-auto w-full rounded-xl"
        />
        {label ? (
          <span className="absolute start-2 top-2 rounded bg-ink/80 px-2 text-sm text-paper">{label}</span>
        ) : null}
      </div>
      {image.credit && (
        <figcaption className="mt-1 text-xs text-muted">
          ছবি: <a href={image.credit.sourceUrl} className="underline">{image.credit.author}</a>,{" "}
          {image.credit.license}
        </figcaption>
      )}
    </figure>
  );
}

function Sources({ place }: { place: Place }) {
  return (
    <section className="mt-12 border-t border-line pt-6 text-sm">
      <h2 className="mb-2 font-semibold">সূত্র</h2>
      <ol className="list-decimal ps-5 text-muted">
        {place.sources.map((s) => (
          <li key={s.id}>
            <a href={s.url} className="underline">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
      {SITE.reportFormUrl && (
        <p className="mt-4">
          ভুল দেখেছেন?{" "}
          <a href={`${SITE.reportFormUrl}${encodeURIComponent(place.slug)}`} className="font-semibold text-accent underline">
            আমাদের জানান
          </a>
        </p>
      )}
    </section>
  );
}
