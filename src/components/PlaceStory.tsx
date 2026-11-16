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
        <p className="mt-4 rounded-control bg-warning-soft px-3.5 py-2 text-meta text-warning">
          খসড়া · status: {place.status}. এই পাতা এখনো যাচাই হয়নি, প্রকাশিত সাইটে দেখা যাবে না।
        </p>
      )}

      <header className="pt-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-display font-bold tracking-tight text-balance @2xl:text-4xl">{place.name.bn}</h1>
            {place.name.en && <p className="mt-1 text-meta text-muted">{place.name.en}</p>}
          </div>
          <ActionRow compact title={place.name.bn} url={`/place/${place.slug}`} lat={place.location.lat} lng={place.location.lng} />
        </div>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-2">
          <EraTag era={place.era} />
          <span className="size-[3px] rounded-full bg-subtle" aria-hidden />
          {place.city.bn}
          <span className="size-[3px] rounded-full bg-subtle" aria-hidden />
          {builtLabel(place)}
        </p>
        {place.status === "published" && (
          <p className="mt-3 text-meta">
            <span className="font-semibold text-success">✓ যাচাই করা</span>
            <span className="text-muted"> · উৎস মিলিয়ে লেখা</span>
          </p>
        )}
      </header>

      <p className="mt-4 text-lead">{place.summary.bn}</p>

      {place.hero && (
        <Figure image={place.images[place.hero.image]} alt={place.hero.alt} priority className="mt-6" />
      )}

      {place.keyNumbers && (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 @lg:grid-cols-4">
          {place.keyNumbers.map((k) => (
            <div key={k.label.bn} className="flex flex-col-reverse">
              <dt className="text-meta text-muted">{k.label.bn}</dt>
              <dd className="text-xl leading-tight font-bold">{k.value.bn}</dd>
            </div>
          ))}
        </dl>
      )}

      {stages.length > 0 && (
        <Section title="কীভাবে গড়ে উঠল">
          <ol className="grid gap-6">
            {stages.map((s, i) => (
              <li key={i}>
                <p className="text-meta text-muted">
                  ধাপ {bnYear(i + 1)}
                  {s.year !== undefined && ` · ${bnYear(s.year)}`}
                </p>
                <h3 className="font-semibold">{s.title.bn}</h3>
                {s.image && <Figure image={place.images[s.image.image]} alt={s.image.alt} className="mt-2" />}
                {s.body && <p className="mt-1 text-body text-ink-2">{s.body.bn}</p>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {events.length > 0 && (
        <Section title="সময়রেখা">
          <ol className="relative border-s border-line ps-5">
            {events.map((e, i) => (
              <li key={i} className="relative pb-5 last:pb-0">
                <span className="absolute -start-[25px] top-2 size-2 rounded-full border-2 border-paper bg-accent" aria-hidden />
                <p className="text-meta font-semibold text-accent">{bnYear(e.year)}</p>
                <h3 className="leading-snug font-medium">{e.title.bn}</h3>
                {e.body && <p className="mt-0.5 text-body text-ink-2">{e.body.bn}</p>}
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
          <ul className="grid gap-4 @lg:grid-cols-2">
            {people.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-meta font-semibold text-accent" aria-hidden>
                  {[...p.title.bn][0]}
                </span>
                <div>
                  <h3 className="font-medium">{p.title.bn}</h3>
                  {p.body && <p className="mt-0.5 text-body text-ink-2">{p.body.bn}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {facts.length > 0 && (
        <Section title="জানা দরকার">
          <ul className="grid gap-3">
            {facts.map((f, i) => (
              <li key={i} className="border-s-2 border-accent-soft-hover ps-3">
                <h3 className="font-medium">{f.title.bn}</h3>
                {f.body && <p className="mt-0.5 text-body text-ink-2">{f.body.bn}</p>}
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
    <section className="mt-8 border-t border-line pt-4">
      <h2 className="mb-4 text-[1.0625rem] font-semibold">{title}</h2>
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
          className="h-auto max-h-[70vh] w-full rounded-media object-cover"
        />
        {label ? (
          <span className="absolute start-2 top-2 rounded-md bg-card/90 px-2 text-meta font-semibold">{label}</span>
        ) : null}
      </div>
      {image.credit && (
        <figcaption className="mt-1.5 truncate text-micro text-muted">
          ছবি:{" "}
          <a href={image.credit.sourceUrl} className="hover:text-ink hover:underline">
            {image.credit.author}
          </a>
          {" · "}
          {image.credit.license}
        </figcaption>
      )}
    </figure>
  );
}

function Sources({ place }: { place: Place }) {
  return (
    <section className="mt-10 border-t border-line pt-4 text-meta">
      <h2 className="mb-2 font-semibold">সূত্র</h2>
      <ol className="grid list-decimal gap-0.5 ps-5 text-muted">
        {place.sources.map((s) => (
          <li key={s.id}>
            <a href={s.url} className="hover:text-ink hover:underline">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
      {SITE.reportFormUrl && (
        <p className="mt-4">
          ভুল দেখেছেন?{" "}
          <a href={`${SITE.reportFormUrl}${encodeURIComponent(place.slug)}`} className="font-semibold text-accent hover:text-accent-hover hover:underline">
            আমাদের জানান
          </a>
        </p>
      )}
    </section>
  );
}
