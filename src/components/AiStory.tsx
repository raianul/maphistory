"use client";

import { ERA_META, periodDisplay, periodStart } from "@/lib/format";
import type { AiPlace, PartialStory } from "@/lib/ai/types";
import { ERAS, type Era } from "@/lib/schema";
import type { PlaceVideo } from "@/lib/video";
import { ActionRow } from "./ActionRow";
import { ReportMistake } from "./ReportMistake";
import { VideoPlayer } from "./VideoPlayer";

type Confidence = "high" | "medium" | "low";
type PartialPeriod = NonNullable<PartialStory["periods"]>[number];
type Display = ReturnType<typeof periodDisplay>;

/** What each item rests on. "documented" gets no tag: that is the normal case. */
const EVIDENCE: Record<string, { bn: string; className: string }> = {
  scholarly: { bn: "গবেষকদের ব্যাখ্যা", className: "bg-sky-50 text-sky-800" },
  tradition: { bn: "লোকঐতিহ্য", className: "bg-violet-50 text-violet-800" },
  legend: { bn: "কিংবদন্তি", className: "bg-violet-50 text-violet-800" },
  disputed: { bn: "বিতর্কিত", className: "bg-amber-50 text-amber-800" },
};

/**
 * A place in the panel: header, short introduction, then the place's video
 * (when there is one) as the main content, and the historical story as
 * supporting sections below it. Without a video the story itself is the main
 * content, shown open and filled in as it streams.
 *
 * The story is Gemini's own knowledge, as JSON, told period by period with
 * periods that fit the place. Both story formats are read (v2: periods with
 * their own labels; v1: fixed South Asian period keys). While streaming,
 * every field may be missing or half-written.
 */
export function AiStory({
  story: s,
  image,
  model,
  streaming,
  fallbackName,
  at,
  shareUrl,
  onExplore,
  id,
  status,
  videos = [],
}: {
  story: PartialStory;
  image?: AiPlace["image"];
  model?: string;
  streaming: boolean;
  fallbackName: string;
  /** Where the place is, for directions. */
  at: { lat: number; lng: number };
  /** Link that reopens this story (for sharing). */
  shareUrl: string;
  /** Opens the story of a place mentioned in this one. */
  onExplore?: (name: string) => void;
  /** Saved story id (for reports) and whether the admin has checked it. */
  id?: string;
  status?: AiPlace["status"];
  /** The place's historical videos, main one first. */
  videos?: PlaceVideo[];
}) {
  const hasVideo = videos.length > 0;
  // Periods of either format; once complete, in chronological order. While streaming they keep
  // arrival order (the model writes them chronologically) so nothing jumps around.
  const periods = (s.periods ?? []).filter((p): p is PartialPeriod => !!p && !!(p.label_bn || p.period) && !!p.intro_bn);
  if (!streaming) periods.sort((a, b) => periodStart(a) - periodStart(b));
  const shown = periods.map((p, i) => ({ p, d: periodDisplay(p, i, s.country) }));

  // The period it is best known for: v2 names it; v1 had a fixed era.
  const legacyEra = ERAS.includes(s.era as Era) ? ERA_META[s.era as Era] : undefined;
  const eraLabel = s.era_label_bn?.trim() || (legacyEra ? `${legacyEra.bn} আমল` : undefined);
  const debates = (s.historical_debates ?? []).filter((d) => d?.question_bn);
  const oldNames = (s.historical_names ?? []).filter((n) => n?.name);
  const placesHere = (s.places_here ?? []).filter((p) => p?.name_bn);
  const keyNumbers = (s.key_numbers ?? []).filter((k) => k?.value_bn);
  const name = s.name_bn || fallbackName;
  const meta = [s.kind_bn, eraLabel, s.origin_bn].filter(Boolean);
  // Supporting sections start open when the story is the main content, folded under a video.
  const open = !hasVideo;

  return (
    <article className="pb-16">
      {/* A. Location header */}
      <header className="pt-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{name}</h1>
            <p className="mt-0.5 min-h-5 text-sm text-muted">
              {s.locality_en ?? (streaming ? "" : s.name_en)}
              {s.locality_en && s.name_en && !s.locality_en.startsWith(s.name_en) && <span className="text-muted/80"> · {s.name_en}</span>}
            </p>
          </div>
          <ActionRow
            compact
            title={name}
            url={shareUrl}
            lat={at.lat}
            lng={at.lng}
            destination={!streaming ? directionsQuery(s.name_en, s.locality_en) : undefined}
          />
        </div>
        {meta.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {meta.map((m, i) => (
              <span key={i} className="rounded-full bg-ink/[.05] px-2.5 py-0.5 text-ink/75">
                {m}
              </span>
            ))}
          </p>
        )}
      </header>

      <StatusLine streaming={streaming} status={status} />

      {/* Short introduction */}
      {s.summary_bn ? (
        <p className="mt-3 text-[17px] leading-relaxed">{s.summary_bn}</p>
      ) : streaming ? (
        <SkeletonLines lines={3} className="mt-4" />
      ) : null}

      {/* B. Video: the main content when the place has one; otherwise the photo */}
      {hasVideo ? (
        <VideoPlayer videos={videos} />
      ) : image ? (
        <figure className="mt-5">
          {/* Commons photo, licence checked on the server. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={name} className="aspect-video w-full animate-[fadein_.6s_ease] rounded-xl object-cover" />
          <figcaption className="mt-1 text-[11px] text-muted">
            ছবি:{" "}
            <a href={image.credit.sourceUrl} className="underline" target="_blank" rel="noreferrer">
              {image.credit.author}
            </a>
            ,{" "}
            {image.credit.licenseUrl ? (
              <a href={image.credit.licenseUrl} className="underline" target="_blank" rel="noreferrer">
                {image.credit.license}
              </a>
            ) : (
              image.credit.license
            )}
          </figcaption>
        </figure>
      ) : streaming ? (
        <div className="mt-5 aspect-video w-full animate-pulse rounded-xl bg-ink/[.05]" aria-hidden />
      ) : null}

      {keyNumbers.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3">
          {keyNumbers.map((k, i) => (
            <div key={i}>
              <dd className="text-lg leading-tight font-bold">{k.value_bn}</dd>
              <dt className="text-xs text-muted">{k.label_bn}</dt>
            </div>
          ))}
        </dl>
      )}

      {/* C. Supporting historical information */}
      {(s.name_story_bn || oldNames.length > 0 || s.historical_significance_bn) && (
        <Disclosure title="নাম ও পরিচয়" open={open}>
          {s.name_story_bn && <p className="text-[15px]">{s.name_story_bn}</p>}
          {oldNames.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted">আগের নাম:</span>
              {oldNames.map((n, i) => (
                <span key={i} className="rounded-full border border-line px-2 py-0.5">
                  {n.name}
                  {n.when_bn && <span className="text-muted"> · {n.when_bn}</span>}
                </span>
              ))}
            </p>
          )}
          {s.historical_significance_bn && (
            <p className="mt-2 text-[15px]">
              <span className="font-semibold">ইতিহাসে গুরুত্ব: </span>
              {s.historical_significance_bn}
            </p>
          )}
        </Disclosure>
      )}

      {shown.length > 0 ? (
        <Disclosure title="ইতিহাস, আমল ধরে" count={shown.length} open={open}>
          {/* Period chips: the whole history at a glance; tap to jump */}
          <nav className="sticky top-0 z-10 -mx-5 flex gap-1.5 overflow-x-auto bg-paper/95 px-5 py-2 backdrop-blur" aria-label="আমল">
            {shown.map(({ d }, i) => (
              <a
                key={i}
                href={`#period-${i}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`period-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                title={d.bn}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-xs text-ink/80 hover:border-ink/30"
              >
                <span className="size-1.5 rounded-full" style={{ background: d.hex }} />
                {d.short}
              </a>
            ))}
          </nav>
          {shown.map(({ p, d }, i) => (
            <PeriodSection key={i} index={i} period={p} display={d} streaming={streaming} />
          ))}
        </Disclosure>
      ) : streaming && s.summary_bn ? (
        <SkeletonLines lines={4} className="mt-8" />
      ) : null}

      {placesHere.length > 0 && (
        <Disclosure title="এখানে যা আছে" count={placesHere.length} open={open}>
          <ul className="-mx-2 grid">
            {placesHere.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={!onExplore || streaming}
                  onClick={() => p.name_bn && onExplore?.(p.name_bn)}
                  className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-start enabled:hover:bg-ink/[.04]"
                >
                  <span className="flex-1 text-[15px]">
                    <span className="font-semibold group-enabled:group-hover:text-accent">{p.name_bn}</span>
                    {p.what_bn && <span className="text-muted"> · {p.what_bn}</span>}
                  </span>
                  {onExplore && !streaming && (
                    <span className="mt-0.5 text-muted group-hover:text-accent" aria-hidden>
                      →
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {(debates.length > 0 || s.uncertain_bn) && (
        <Disclosure title="ভিন্নমত ও অনিশ্চয়তা" open={false}>
          {debates.map((d, i) => (
            <div key={i} className="mb-3">
              <p className="font-semibold">{d.question_bn}</p>
              <ul className="mt-1 grid gap-1 text-[15px] text-ink/85">
                {(d.views_bn ?? []).filter(Boolean).map((v, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-muted">{["ক", "খ", "গ"][j] ?? "•"}.</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {s.uncertain_bn && <p className="text-[15px] text-ink/85">{s.uncertain_bn}</p>}
        </Disclosure>
      )}

      {!streaming && id && <ReportMistake storyId={id} />}

      {!streaming && (
        <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
          <p>
            <span className="font-semibold">সম্ভবত</span> = প্রচলিত তথ্য, খুঁটিনাটিতে ভিন্নমত আছে ·{" "}
            <span className="font-semibold">অনিশ্চিত</span> = নিশ্চিত হওয়া যায়নি ·{" "}
            <span className="font-semibold">গবেষকদের ব্যাখ্যা</span> = নথি নয়, ঐতিহাসিকদের বিশ্লেষণ ·{" "}
            <span className="font-semibold">লোকঐতিহ্য / কিংবদন্তি</span> = মুখে মুখে চলে আসা কাহিনি ·{" "}
            <span className="font-semibold">বিতর্কিত</span> = ঐতিহাসিকরা একমত নন
          </p>
          {s.sources && s.sources.length > 0 ? (
            <div className="mt-2">
              <p className="font-semibold">সূত্র</p>
              <ul className="mt-1 grid gap-0.5">
                {s.sources.map((src, i) =>
                  src?.title ? (
                    <li key={i}>
                      {src.url ? (
                        <a href={src.url} className="underline" target="_blank" rel="noreferrer">
                          {src.title}
                        </a>
                      ) : (
                        src.title
                      )}
                      {src.author_or_institution && ` · ${src.author_or_institution}`}
                      {src.year !== undefined && ` · ${src.year}`}
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          ) : (
            <p className="mt-1">উৎস: AI মডেলের নিজস্ব জ্ঞান; কোনো বাইরের সূত্র মিলিয়ে দেখা হয়নি।</p>
          )}
          {model && <p className="mt-1">মডেল: {model}</p>}
        </footer>
      )}
    </article>
  );
}

/** One line under the header: being written, or how far the story can be trusted. */
function StatusLine({ streaming, status }: { streaming: boolean; status?: AiPlace["status"] }) {
  if (streaming) {
    return (
      <p className="mt-3 flex items-center gap-2 text-xs text-accent" aria-live="polite">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/60" />
          <span className="relative inline-flex size-2 rounded-full bg-accent" />
        </span>
        ইতিহাস লেখা হচ্ছে…
      </p>
    );
  }
  return status === "verified" ? (
    <p className="mt-3 text-xs text-emerald-700">
      <span className="font-semibold">✓ যাচাই করা গল্প</span> · সম্পাদক তথ্যগুলো মিলিয়ে দেখেছেন
    </p>
  ) : (
    <p className="mt-3 text-xs text-muted">
      <span className="font-semibold text-accent">✦ AI দিয়ে লেখা</span> · Gemini-এর নিজস্ব জ্ঞান থেকে · এখনো যাচাই করা হয়নি
    </p>
  );
}

/** A section that folds: open by default when it is the main content, closed under a video. */
function Disclosure({ title, count, open, children }: { title: string; count?: number; open: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group mt-6 border-t border-line pt-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 select-none">
        <h2 className="text-base font-semibold">{title}</h2>
        {count !== undefined && <span className="text-xs text-muted">{count}</span>}
        <svg
          viewBox="0 0 20 20"
          className="ms-auto size-4 text-muted transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="mt-2 animate-[fadein_.3s_ease]">{children}</div>
    </details>
  );
}

function SkeletonLines({ lines, className = "" }: { lines: number; className?: string }) {
  return (
    <div className={`grid gap-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3.5 animate-pulse rounded bg-ink/[.06]" style={{ width: `${[92, 84, 70, 88][i % 4]}%` }} />
      ))}
    </div>
  );
}

/** One period: name and years, what the place was like then, then its events, people and facts. */
function PeriodSection({
  index,
  period: p,
  display: meta,
  streaming,
}: {
  index: number;
  period: PartialPeriod;
  display: Display;
  streaming: boolean;
}) {
  const events = (p.events ?? []).filter((e) => e?.title_bn);
  // While streaming keep arrival order so items don't jump; sort by year once complete.
  if (!streaming) events.sort((a, b) => (a.sort_year ?? 0) - (b.sort_year ?? 0));
  const people = (p.people ?? []).filter((x) => x?.name_bn);
  const facts = (p.facts ?? []).filter((f) => f?.title_bn);

  return (
    <section id={`period-${index}`} className="mt-5 animate-[fadein_.4s_ease] scroll-mt-12">
      <div className="flex items-baseline gap-2">
        <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: meta.hex }} aria-hidden />
        <h3 className="font-semibold">{meta.bn}</h3>
        <span className="text-xs text-muted">{meta.range}</span>
      </div>
      <p className="mt-1 text-[15px] leading-relaxed text-ink/85">{p.intro_bn}</p>

      {events.length > 0 && (
        <ol className="mt-3 grid gap-3 border-s border-line ps-4">
          {events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -start-[21px] top-2 size-2 rounded-full border-2 border-paper" style={{ background: meta.hex }} aria-hidden />
              <p className="text-xs font-semibold" style={{ color: meta.hex }}>
                {e.when_bn}
              </p>
              <p className="leading-snug font-medium">
                {e.title_bn}
                <EvidenceTag value={e.evidence_level} />
                <ConfidenceTag value={e.confidence} />
              </p>
              {e.body_bn && <p className="mt-0.5 text-[15px] text-ink/80">{e.body_bn}</p>}
            </li>
          ))}
        </ol>
      )}

      {people.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {people.map((x, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
                style={{ background: `${meta.hex}1a`, color: meta.hex }}
                aria-hidden
              >
                {[...(x.name_bn ?? "")][0]}
              </span>
              <div>
                <p className="font-medium">
                  {x.name_bn}
                  <EvidenceTag value={x.evidence_level} />
                  <ConfidenceTag value={x.confidence} />
                </p>
                {x.role_bn && <p className="text-xs text-muted">{x.role_bn}</p>}
                {x.body_bn && <p className="mt-0.5 text-sm text-ink/80">{x.body_bn}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {facts.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {facts.map((f, i) => (
            <li key={i} className="border-s-2 ps-3" style={{ borderColor: meta.hex }}>
              <p className="font-medium">
                {f.title_bn}
                <EvidenceTag value={f.evidence_level} />
                <ConfidenceTag value={f.confidence} />
              </p>
              {f.body_bn && <p className="mt-0.5 text-[15px] text-ink/80">{f.body_bn}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Taj Mahal" + "Agra, Uttar Pradesh, India", without repeating the name when the locality starts with it. */
function directionsQuery(name?: string, locality?: string): string | undefined {
  if (!name || !locality) return undefined;
  return locality.toLowerCase().startsWith(name.toLowerCase()) ? locality : `${name}, ${locality}`;
}

/** What an item rests on, when it isn't plain documented history. */
function EvidenceTag({ value }: { value?: string }) {
  const e = value ? EVIDENCE[value] : undefined;
  if (!e) return null;
  return <span className={`ms-2 rounded px-1.5 py-0.5 align-middle text-[11px] font-normal ${e.className}`}>{e.bn}</span>;
}

/** High-confidence items get no tag; the rest say how sure the AI is. */
function ConfidenceTag({ value }: { value?: string }) {
  const v = value as Confidence | undefined;
  if (!v || v === "high") return null;
  return v === "medium" ? (
    <span className="ms-2 rounded bg-ink/[.06] px-1.5 py-0.5 align-middle text-[11px] font-normal text-ink/70">সম্ভবত</span>
  ) : (
    <span className="ms-2 rounded bg-amber-50 px-1.5 py-0.5 align-middle text-[11px] font-normal text-amber-800">অনিশ্চিত</span>
  );
}
