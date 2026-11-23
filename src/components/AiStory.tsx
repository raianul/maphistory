"use client";

import { Fragment } from "react";
import { ERA_META, periodDisplay, periodStart, readableText } from "@/lib/format";
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
  // Neutral for kinds of evidence; the warning colour only where historians disagree.
  scholarly: { bn: "গবেষকদের ব্যাখ্যা", className: "bg-pressed/60 text-ink-2" },
  tradition: { bn: "লোকঐতিহ্য", className: "bg-accent-soft text-accent" },
  legend: { bn: "কিংবদন্তি", className: "bg-accent-soft text-accent" },
  disputed: { bn: "বিতর্কিত", className: "bg-warning-soft text-warning" },
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
  verifiedAt,
  videos = [],
  notice,
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
  /** When the admin verified it (ISO). */
  verifiedAt?: string;
  /** The place's historical videos, main one first. */
  videos?: PlaceVideo[];
  /** Shown under the header, e.g. a "stopped midway, retry" notice; what was written stays below it. */
  notice?: React.ReactNode;
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
  const keyDates = (s.key_dates ?? []).filter((k) => k?.date_bn && k.text_bn);
  const sources = (s.sources ?? []).filter((src) => src?.title);
  const verified = status === "verified";
  const name = s.name_bn || fallbackName;
  const meta = [s.kind_bn, eraLabel, s.origin_bn].filter(Boolean);
  // Supporting sections start open when the story is the main content, folded under a video.
  const open = !hasVideo;

  return (
    <article className="pb-16">
      {/* A. Location header: name, where, what kind and when (one quiet line), actions. */}
      <header className="pt-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-display font-bold tracking-tight text-balance">{name}</h1>
            {/* Reserved height, so the line arriving doesn't push the story down. */}
            <p className="mt-1 min-h-[1.25rem] text-meta text-muted">
              {s.locality_en ?? (streaming ? <span className="skeleton mt-1 block h-3 w-40 rounded" aria-hidden /> : s.name_en)}
              {s.locality_en && s.name_en && !s.locality_en.startsWith(s.name_en) && <span> · {s.name_en}</span>}
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
        <p className="mt-2.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-2 text-meta text-ink-2">
          {meta.map((m, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="size-[3px] rounded-full bg-subtle" aria-hidden />}
              {m}
            </span>
          ))}
          {streaming && meta.length === 0 && <span className="skeleton block h-3 w-28 rounded" aria-hidden />}
        </p>
      </header>

      {notice}

      <StatusLine streaming={streaming} status={status} verifiedAt={verifiedAt} />

      {/* Short introduction */}
      {s.summary_bn ? (
        <p className="mt-4 text-lead">{s.summary_bn}</p>
      ) : streaming ? (
        <SkeletonLines lines={3} className="mt-5" tall />
      ) : null}

      {/* B. Video: the main content when the place has one; otherwise the photo */}
      {hasVideo ? (
        <VideoPlayer videos={videos} />
      ) : image ? (
        <figure className="mt-6">
          {/* Commons photo, licence checked on the server. */}
          <div className="aspect-video w-full overflow-hidden rounded-media bg-hover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt={name} className="size-full animate-[fadein_.6s_ease] object-cover" />
          </div>
          <figcaption className="mt-1.5 truncate text-micro text-muted" title={`${image.credit.author}, ${image.credit.license}`}>
            ছবি:{" "}
            <a href={image.credit.sourceUrl} className="hover:text-ink hover:underline" target="_blank" rel="noreferrer">
              {image.credit.author}
            </a>
            {" · "}
            {image.credit.licenseUrl ? (
              <a href={image.credit.licenseUrl} className="hover:text-ink hover:underline" target="_blank" rel="noreferrer">
                {image.credit.license}
              </a>
            ) : (
              image.credit.license
            )}
          </figcaption>
        </figure>
      ) : streaming ? (
        <div className="skeleton mt-6 aspect-video w-full rounded-media" aria-hidden />
      ) : null}

      {keyNumbers.length > 0 && (
        <dl className="mt-6 grid animate-[fadein_.4s_ease] grid-cols-2 gap-x-6 gap-y-4">
          {keyNumbers.map((k, i) => (
            <div key={i} className="flex flex-col-reverse">
              <dt className="text-meta text-muted">{k.label_bn}</dt>
              <dd className="text-xl leading-tight font-bold">{k.value_bn}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* C. Supporting historical information */}
      {(s.name_story_bn || oldNames.length > 0 || s.historical_significance_bn) && (
        <Disclosure title="নাম ও পরিচয়" open={open}>
          {s.name_story_bn && <p className="text-body">{s.name_story_bn}</p>}
          {oldNames.length > 0 && (
            <p className="mt-3 text-meta">
              <span className="text-muted">আগের নাম: </span>
              {oldNames.map((n, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-muted"> → </span>}
                  <span className="font-semibold">{n.name}</span>
                  {n.when_bn && <span className="text-muted"> ({n.when_bn})</span>}
                </span>
              ))}
            </p>
          )}
          {s.historical_significance_bn && (
            <p className="mt-3 text-body">
              <span className="font-semibold">ইতিহাসে গুরুত্ব: </span>
              {s.historical_significance_bn}
            </p>
          )}
        </Disclosure>
      )}

      {/* Dates an editor checked against the sources. */}
      {keyDates.length > 0 && (
        <Disclosure title="মূল তারিখ" count={keyDates.length} open={open}>
          {/* One grid for all rows, so the text column lines up. */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-body">
            {keyDates.map((k, i) => (
              <Fragment key={i}>
                <dt className="font-semibold text-ink-2 tabular-nums">{k.date_bn}</dt>
                <dd>{k.text_bn}</dd>
              </Fragment>
            ))}
          </dl>
        </Disclosure>
      )}

      {shown.length > 0 ? (
        <Disclosure title="ইতিহাস, আমল ধরে" count={shown.length} open={open}>
          {/* Period chips: the whole history at a glance; tap to jump */}
          <nav
            className="sticky top-0 z-10 -mx-5 flex gap-1.5 overflow-x-auto bg-paper/95 px-5 py-2 backdrop-blur [scrollbar-width:none] md:-mx-6 md:px-6"
            aria-label="আমল"
          >
            {shown.map(({ d }, i) => (
              <a
                key={i}
                href={`#period-${i}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`period-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                title={d.bn}
                className="relative flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-hover px-3 text-meta text-ink-2 transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] hover:bg-accent-soft hover:text-accent active:bg-accent-soft-hover"
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
        <SkeletonSection />
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
                  className="group flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2 py-2 text-start transition-colors enabled:hover:bg-accent-soft enabled:active:bg-accent-soft-hover"
                >
                  <span className="flex-1 text-body">
                    <span className="font-semibold group-enabled:group-hover:text-accent-hover">{p.name_bn}</span>
                    {p.what_bn && <span className="text-muted"> · {p.what_bn}</span>}
                  </span>
                  {onExplore && !streaming && (
                    <span className="mt-0.5 text-subtle group-hover:text-accent-hover" aria-hidden>
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
              <ul className="mt-1 grid gap-1 text-body text-ink-2">
                {(d.views_bn ?? []).filter(Boolean).map((v, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-muted">{["ক", "খ", "গ"][j] ?? "•"}.</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {s.uncertain_bn && <p className="text-body text-ink-2">{s.uncertain_bn}</p>}
        </Disclosure>
      )}

      {sources.length > 0 && (
        <Disclosure title="সূত্র" count={sources.length} open={false}>
          <ul className="grid gap-2 text-meta">
            {sources.map((src, i) => (
              <li key={i}>
                {src.url ? (
                  <a href={src.url} className="text-accent underline underline-offset-2 hover:text-accent-hover" target="_blank" rel="noreferrer">
                    {src.title}
                  </a>
                ) : (
                  src.title
                )}
                {src.author_or_institution && <span className="text-muted"> · {src.author_or_institution}</span>}
                {src.year !== undefined && <span className="text-muted"> · {src.year}</span>}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {/* While writing: a quiet marker where the next part will appear. */}
      {streaming && s.summary_bn && (
        <p className="mt-8 flex items-center gap-2 text-meta text-muted" aria-hidden>
          <TypingDots />
          আরও লেখা হচ্ছে
        </p>
      )}

      {!streaming && id && <ReportMistake storyId={id} />}

      {!streaming && (
        <footer className="mt-10 animate-[fadein_.4s_ease] border-t border-line pt-4 text-micro text-muted">
          <p>
            <span className="font-semibold">সম্ভবত</span> = প্রচলিত তথ্য, খুঁটিনাটিতে ভিন্নমত আছে ·{" "}
            <span className="font-semibold">অনিশ্চিত</span> = নিশ্চিত হওয়া যায়নি ·{" "}
            <span className="font-semibold">গবেষকদের ব্যাখ্যা</span> = নথি নয়, ঐতিহাসিকদের বিশ্লেষণ ·{" "}
            <span className="font-semibold">লোকঐতিহ্য / কিংবদন্তি</span> = মুখে মুখে চলে আসা কাহিনি ·{" "}
            <span className="font-semibold">বিতর্কিত</span> = ঐতিহাসিকরা একমত নন
          </p>
          {verified ? (
            <>
              {s.corrections_bn && (
                <p className="mt-2">
                  <span className="font-semibold">সংশোধন: </span>
                  {s.corrections_bn}
                </p>
              )}
              <p className="mt-2 font-semibold text-ink-2">
                খসড়াটি AI (Google Gemini) লিখেছে; সম্পাদক তথ্যগুলো {sources.length > 0 ? "ওপরের সূত্রের সঙ্গে " : ""}মিলিয়ে দেখেছেন
                {verifiedAt && bnDate(verifiedAt) ? ` (${bnDate(verifiedAt)})` : ""}।{" "}
                <a href="/about" className="font-normal text-accent underline">
                  আরও জানুন
                </a>
              </p>
            </>
          ) : (
            <>
              {sources.length === 0 && <p className="mt-1">উৎস: AI মডেলের নিজস্ব জ্ঞান; কোনো বাইরের সূত্র মিলিয়ে দেখা হয়নি।</p>}
              <p className="mt-2 font-semibold text-ink-2">
                এই গল্পটি AI (Google Gemini{model ? `, ${model}` : ""}) লিখেছে; কেউ যাচাই করেনি, ভুল থাকতে পারে।{" "}
                <a href="/about" className="font-normal text-accent underline">
                  আরও জানুন
                </a>
              </p>
            </>
          )}
        </footer>
      )}
    </article>
  );
}

/** One line under the header: being written, or how far the story can be trusted. */
function StatusLine({ streaming, status, verifiedAt }: { streaming: boolean; status?: AiPlace["status"]; verifiedAt?: string }) {
  // One fixed-height line in every state, so nothing below it moves when writing finishes.
  const line = "mt-3 flex min-h-5 items-center gap-2 text-meta";
  if (streaming) {
    return (
      <p className={`${line} text-accent`} role="status" aria-live="polite">
        <TypingDots />
        ইতিহাস লেখা হচ্ছে…
      </p>
    );
  }
  const date = verifiedAt ? bnDate(verifiedAt) : undefined;
  return status === "verified" ? (
    <p className={`${line} animate-[fadein_.3s_ease] text-muted`}>
      <span className="font-semibold text-success" title={date ? `যাচাই করা হয়েছে ${date}` : undefined}>
        ✓ যাচাইকৃত
      </span>
      <span className="truncate">· সম্পাদক তথ্যগুলো সূত্রের সঙ্গে মিলিয়ে দেখেছেন</span>
    </p>
  ) : (
    <p className={`${line} animate-[fadein_.3s_ease] text-muted`}>
      <span className="font-semibold text-accent">✦ AI দিয়ে লেখা</span>
      <span className="truncate">· এখনো যাচাই করা হয়নি</span>
    </p>
  );
}

/** "২৩ নভেম্বর ২০২৬" (Dhaka time). */
function bnDate(iso: string): string | undefined {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
}

/** A section that folds: open by default when it is the main content, closed under a video. */
function Disclosure({ title, count, open, children }: { title: string; count?: number; open: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group mt-8 animate-[fadein_.4s_ease] border-t border-line [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 select-none">
        <h2 className="text-[1.0625rem] font-semibold">{title}</h2>
        {count !== undefined && <span className="text-meta text-muted">{count}</span>}
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
      <div className="pb-1 animate-[fadein_.3s_ease]">{children}</div>
    </details>
  );
}

/** Grey lines where text will appear, about as tall as the text they stand for. */
function SkeletonLines({ lines, className = "", tall }: { lines: number; className?: string; tall?: boolean }) {
  return (
    <div className={`grid ${tall ? "gap-3.5" : "gap-3"} ${className}`} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`skeleton rounded ${tall ? "h-4" : "h-3.5"}`} style={{ width: `${[94, 86, 62, 90][i % 4]}%` }} />
      ))}
    </div>
  );
}

/** The shape of a section that is about to arrive: a heading, then a few lines. */
function SkeletonSection() {
  return (
    <div className="mt-8 border-t border-line pt-4" aria-hidden>
      <div className="skeleton h-4 w-2/5 rounded" />
      <SkeletonLines lines={4} className="mt-4" />
    </div>
  );
}

/** Three softly pulsing dots: "still writing", without pretending to know how far along. */
function TypingDots() {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1 animate-pulse rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
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
    <section id={`period-${index}`} className="mt-6 animate-[rise_.4s_var(--ease-out)] scroll-mt-14">
      <div className="flex items-baseline gap-2">
        <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: meta.hex }} aria-hidden />
        <h3 className="font-semibold">{meta.bn}</h3>
        <span className="text-meta text-muted">{meta.range}</span>
      </div>
      <p className="mt-1.5 text-body text-ink-2">{p.intro_bn}</p>

      {events.length > 0 && (
        <ol className="mt-3 grid gap-3 border-s border-line ps-4">
          {events.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -start-[21px] top-2 size-2 rounded-full border-2 border-paper" style={{ background: meta.hex }} aria-hidden />
              <p className="text-meta font-semibold" style={{ color: readableText(meta.hex) }}>
                {e.when_bn}
              </p>
              <p className="leading-snug font-medium">
                {e.title_bn}
                <EvidenceTag value={e.evidence_level} />
                <ConfidenceTag value={e.confidence} />
              </p>
              {e.body_bn && <p className="mt-0.5 text-body text-ink-2">{e.body_bn}</p>}
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
                style={{ background: `${meta.hex}1a`, color: readableText(meta.hex) }}
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
                {x.role_bn && <p className="text-meta text-muted">{x.role_bn}</p>}
                {x.body_bn && <p className="mt-0.5 text-body text-ink-2">{x.body_bn}</p>}
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
              {f.body_bn && <p className="mt-0.5 text-body text-ink-2">{f.body_bn}</p>}
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
  return <span className={`ms-2 rounded px-1.5 py-0.5 align-middle text-micro font-normal whitespace-nowrap ${e.className}`}>{e.bn}</span>;
}

/** High-confidence items get no tag; the rest say how sure the AI is. */
function ConfidenceTag({ value }: { value?: string }) {
  const v = value as Confidence | undefined;
  if (!v || v === "high") return null;
  return v === "medium" ? (
    <span className="ms-2 rounded bg-pressed/60 px-1.5 py-0.5 align-middle text-micro font-normal whitespace-nowrap text-ink-2">সম্ভবত</span>
  ) : (
    <span className="ms-2 rounded bg-warning-soft px-1.5 py-0.5 align-middle text-micro font-normal whitespace-nowrap text-warning">অনিশ্চিত</span>
  );
}
