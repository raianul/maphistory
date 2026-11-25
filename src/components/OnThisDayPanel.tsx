"use client";

import { useEffect, useState } from "react";
import type { OnThisDay, PublicEvent, PublicEventCard } from "@/lib/events/public";
import { EVIDENCE_BN, PHASE_PALETTE, SOURCE_TYPE_BN } from "@/lib/events/schema";
import { PlaceLink } from "./PlaceLink";
import { SidePanel } from "./SidePanel";

const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });
/** "ঢাকা মেডিকেল কলেজ, ঢাকা", without repeating a city that is the place itself. */
const where = (place?: string | null, city?: string | null) => [place, city && city !== place ? city : null].filter(Boolean).join(", ");

/** "জাতীয় সংসদ ভবন, ঢাকা" with the place linked to its page. */
function PlacePart({ name, slug, city }: { name: string; slug: string; city?: string | null }) {
  return (
    <>
      <PlaceLink slug={slug} source="on_this_day">
        {name}
      </PlaceLink>
      {city && city !== name && `, ${city}`}
    </>
  );
}

/** The map (a pin, or the popup's ‹ ›) asks the open event to show step `detail` (index). */
export const STEP_REQUEST = "jg:event-step";

/** "02-21" → "২১ ফেব্রুয়ারি". */
export function dayBn(md: string): string {
  const [m, d] = md.split("-").map(Number);
  return `${bn(d)} ${MONTHS_BN[m - 1]}`;
}

/** The day before or after "MM-DD" (in a leap year, so 29 February is reachable). */
function shiftDay(md: string, by: number): string {
  const [m, d] = md.split("-").map(Number);
  const t = new Date(Date.UTC(2000, m - 1, d + by));
  return `${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/**
 * "আজকের দিনে" (On this day): the published events for a day, and one event's view: its
 * timeline step by step (drawn on the map by PlaceMap, via onTimeline), its story and sources.
 * Inside the existing panel (right column; bottom sheet on phones).
 */
export function OnThisDayPanel({
  slug,
  onPick,
  onBack,
  onClose,
  onTimeline,
}: {
  /** The open event, or null for the list. */
  slug: string | null;
  onPick: (e: PublicEventCard) => void;
  onBack: () => void;
  onClose: () => void;
  /** The event and its current step for the map (step −1: story only); null when no event is shown. */
  onTimeline: (t: { event: PublicEvent; step: number } | null) => void;
}) {
  const [date, setDate] = useState<string | null>(null); // null = today (the server decides, Bangladesh time)
  const [day, setDay] = useState<{ key: string; data?: OnThisDay; error?: string } | null>(null);
  const key = date ?? "today";

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/events/on-this-day${date ? `?date=${date}` : ""}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        setDay(r.ok ? { key, data: d } : { key, error: d.error ?? "ঘটনা আনা যায়নি" });
      })
      .catch(() => !ctrl.signal.aborted && setDay({ key, error: "সংযোগ পাওয়া যায়নি" }));
    return () => ctrl.abort();
  }, [date, key]);

  const current = day?.key === key ? day : null;
  const asked = current?.data?.date ?? date;

  return (
    <SidePanel title={slug ? "ঘটনা" : "আজকের দিনে"} onClose={onClose}>
      {slug ? (
        <EventView slug={slug} onBack={onBack} onTimeline={onTimeline} />
      ) : (
        <div className="pb-10">
          <header className="flex items-center gap-2 pt-1">
            <div className="min-w-0 flex-1">
              <p className="text-meta font-semibold text-accent">আজকের দিনে</p>
              <h1 className="text-display font-bold tracking-tight">{asked ? dayBn(asked) : " "}</h1>
            </div>
            <div className="flex shrink-0">
              {[-1, 1].map((by) => (
                <button
                  key={by}
                  type="button"
                  disabled={!asked}
                  onClick={() => asked && setDate(shiftDay(asked, by))}
                  aria-label={by < 0 ? "আগের দিন" : "পরের দিন"}
                  className="grid size-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-hover active:bg-pressed disabled:opacity-40"
                >
                  {by < 0 ? "‹" : "›"}
                </button>
              ))}
            </div>
          </header>
          {date && (
            <button type="button" onClick={() => setDate(null)} className="mt-1 text-meta font-semibold text-accent hover:underline">
              আজকের তারিখে ফিরুন
            </button>
          )}

          {!current && <ListSkeleton />}
          {current?.error && <p className="mt-6 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{current.error}</p>}
          {current?.data && (
            <>
              {current.data.next && current.data.events.length > 0 && (
                <p className="mt-4 rounded-control bg-hover px-3 py-2 text-meta text-ink-2">
                  {dayBn(current.data.date)}-এ কোনো ঘটনা নেই। পরের ঘটনা: <span className="font-semibold">{dayBn(current.data.shown)}</span>
                </p>
              )}
              {current.data.events.length === 0 ? (
                <p className="mt-8 text-center text-meta text-muted">এখনো কোনো প্রকাশিত ঘটনা নেই।</p>
              ) : (
                <ul className="mt-4 grid gap-2">
                  {current.data.events.map((e) => (
                    <li key={e.slug}>
                      <EventCard e={e} onPick={() => onPick(e)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </SidePanel>
  );
}

function EventCard({ e, onPick }: { e: PublicEventCard; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="flex w-full gap-3 rounded-2xl p-2 text-start transition-colors hover:bg-hover active:bg-pressed">
      <span className="size-20 shrink-0 overflow-hidden rounded-control bg-accent-soft">
        {e.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Commons image, licence checked
          <img src={e.cover_image.src} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-lead font-bold text-accent" aria-hidden>
            {e.year ? bn(e.year) : "•"}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block text-meta font-semibold text-accent">
          {e.year ? bn(e.year) : e.date_label}
          {e.place_name && <span className="font-normal text-muted"> · {where(e.place_name, e.city)}</span>}
        </span>
        <span className="mt-0.5 block font-semibold leading-snug">{e.title}</span>
        {/* The story this date belongs to, when its own title says something else ("কর্নেল আবু তাহের"). */}
        {e.story_title && e.story_title !== e.title && <span className="block text-micro text-muted">{e.story_title}</span>}
        {/* Two lines at most: the full text is one tap away. (No `block` here: it would undo line-clamp's display.) */}
        {e.summary && <span className="mt-0.5 line-clamp-2 text-meta text-ink-2">{e.summary}</span>}
        {e.step_count > 0 && <span className="mt-1 block text-micro text-muted">{bn(e.step_count)} ধাপের সময়রেখা</span>}
      </span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <ul className="mt-4 grid gap-2" aria-hidden>
      {[0, 1].map((i) => (
        <li key={i} className="flex gap-3 p-2">
          <span className="skeleton size-20 shrink-0 rounded-control" />
          <span className="grid flex-1 content-start gap-2 pt-1">
            <span className="skeleton h-3 w-24 rounded" />
            <span className="skeleton h-4 w-4/5 rounded" />
            <span className="skeleton h-3 w-3/5 rounded" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One event: its story and sources (the timeline on the map comes in Phase 4). */
function EventView({ slug, onBack, onTimeline }: { slug: string; onBack: () => void; onTimeline: (t: { event: PublicEvent; step: number } | null) => void }) {
  const [state, setState] = useState<{ slug: string; event?: PublicEvent; error?: string } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/events/${slug}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        setState(r.ok ? { slug, event: d.event } : { slug, error: d.error ?? "ঘটনাটি আনা যায়নি" });
      })
      .catch(() => !ctrl.signal.aborted && setState({ slug, error: "সংযোগ পাওয়া যায়নি" }));
    return () => ctrl.abort();
  }, [slug]);
  const cur = state?.slug === slug ? state : null;

  return (
    <article className="pb-12">
      <button type="button" onClick={onBack} className="-ms-2 h-10 rounded-full px-2 text-meta font-semibold text-accent hover:bg-accent-soft">
        ‹ আজকের দিনের তালিকা
      </button>
      {!cur && (
        <div className="mt-2 grid gap-3" aria-hidden>
          <span className="skeleton h-7 w-3/4 rounded" />
          <span className="skeleton aspect-video w-full rounded-media" />
          <span className="skeleton h-4 w-full rounded" />
          <span className="skeleton h-4 w-5/6 rounded" />
        </div>
      )}
      {cur?.error && <p className="mt-4 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{cur.error}</p>}
      {cur?.event && <EventBody key={cur.event.slug} e={cur.event} onTimeline={onTimeline} />}
    </article>
  );
}

function EventBody({ e, onTimeline }: { e: PublicEvent; onTimeline: (t: { event: PublicEvent; step: number } | null) => void }) {
  const hasTimeline = e.steps.length > 0;
  // The step shown (from ?step= on a shared link), or −1 when reading the story only.
  const [step, setStep] = useState(() => {
    const n = Number(new URLSearchParams(window.location.search).get("step"));
    return hasTimeline ? (Number.isInteger(n) && n >= 1 && n <= e.steps.length ? n - 1 : 0) : -1;
  });
  // Tell the map what to draw; clear it when this event closes.
  useEffect(() => {
    onTimeline({ event: e, step });
    // The address bar carries the step, so a link opens it at the same point.
    const url = new URL(window.location.href);
    if (step >= 0) url.searchParams.set("step", String(step + 1));
    else url.searchParams.delete("step");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [e, step, onTimeline]);
  useEffect(() => () => onTimeline(null), [onTimeline]);
  // The map's popup (or a pin) asks for another step.
  useEffect(() => {
    const go = (ev: Event) => setStep((ev as CustomEvent<number>).detail);
    window.addEventListener(STEP_REQUEST, go);
    return () => window.removeEventListener(STEP_REQUEST, go);
  }, []);

  // Opened from "On this day" (on=MM-DD): that date's own title, with the story's title under it.
  const [on] = useState(() => new URLSearchParams(window.location.search).get("on"));
  const anniversary = on ? e.dates.find((d) => d.md === on) : undefined;
  const when = anniversary
    ? `${dayBn(anniversary.md)} ${bn(anniversary.year)}`
    : e.date_precision === "day" && e.event_month && e.event_day
      ? `${dayBn(`${String(e.event_month).padStart(2, "0")}-${String(e.event_day).padStart(2, "0")}`)} ${e.event_year ? bn(e.event_year) : ""}`
      : e.date_label;
  return (
    <>
      <header className="mt-2">
        <p className="text-meta font-semibold text-accent">{when}</p>
        <h1 className="mt-1 text-display font-bold tracking-tight text-balance">{anniversary?.title ?? e.title}</h1>
        {anniversary && anniversary.title !== e.title && <p className="mt-0.5 text-lead font-semibold text-ink-2">{e.title}</p>}
        {e.place_name && (
          <p className="mt-1 text-meta text-muted">
            {e.place_slug ? <PlacePart name={e.place_name} slug={e.place_slug} city={e.city} /> : where(e.place_name, e.city)}
          </p>
        )}
      </header>
      {/* Wide screens: the card is a popup on the map (PlaceMap); here, the steps to jump between. */}
      {/* Through STEP_REQUEST, so the map's popup also hears it (and reopens, even for the same step). */}
      {hasTimeline && step >= 0 && (
        <StepList e={e} step={step} onStep={(i) => window.dispatchEvent(new CustomEvent(STEP_REQUEST, { detail: i }))} className="hidden md:block" />
      )}
      {/* Phones: the card stays in the sheet (a popup would cover the small map). */}
      {hasTimeline && step >= 0 && (
        <div className="md:hidden">
          <TimelineCard e={e} step={step} onStep={setStep} />
        </div>
      )}
      {hasTimeline && step < 0 && (
        <button
          type="button"
          onClick={() => setStep(0)}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-meta font-semibold text-on-accent transition-colors hover:bg-accent-hover"
        >
          ▶ মানচিত্রে সময়রেখা দেখুন ({bn(e.steps.length)} ধাপ)
        </button>
      )}
      {e.summary && <p className="mt-4 text-lead">{e.summary}</p>}
      {e.cover_image && (
        <figure className="mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- Commons image, licence checked */}
          <img src={e.cover_image.src} alt="" className="aspect-video w-full rounded-media object-cover" />
          <figcaption className="mt-1.5 truncate text-micro text-muted">
            ছবি:{" "}
            <a href={e.cover_image.credit.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
              {e.cover_image.credit.author}
            </a>{" "}
            · {e.cover_image.credit.license}
          </figcaption>
        </figure>
      )}
      {e.narrative && (
        <div className="mt-6 grid gap-3 text-body text-ink-2">
          {e.narrative.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
      {e.sources.length > 0 && (
        <footer className="mt-8 border-t border-line pt-4 text-meta">
          <h2 className="font-semibold">সূত্র</h2>
          <ol className="mt-2 grid list-decimal gap-1 ps-5 text-muted">
            {e.sources.map((s) => (
              <li key={s.id}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
                {[s.author_or_publisher, s.published_on, SOURCE_TYPE_BN[s.source_type]].filter(Boolean).length > 0 && (
                  <span> · {[s.author_or_publisher, s.published_on, SOURCE_TYPE_BN[s.source_type]].filter(Boolean).join(" · ")}</span>
                )}
              </li>
            ))}
          </ol>
        </footer>
      )}
      {/* Always shown, with or without sources: who wrote this. */}
      <p className="mt-4 text-micro text-muted">
        লেখা AI (Google Gemini) দিয়ে তৈরি, সূত্র মিলিয়ে একজন সম্পাদক দেখে প্রকাশ করেছেন। তবুও ভুল থাকতে পারে।{" "}
        <a href="/about" className="text-accent underline">
          আরও জানুন
        </a>
      </p>
    </>
  );
}

// ── The timeline, step by step ────────────────────────────────────────────────────────────

/**
 * The current step (title, when, where, story, image) with previous/next, a step slider and the
 * phase legend. The map follows (PlaceMap draws and frames the step). Unknown places say so.
 */
function TimelineCard({ e, step, onStep }: { e: PublicEvent; step: number; onStep: (n: number) => void }) {
  const s = e.steps[step];
  const n = e.steps.length;
  const phase = e.phases.find((p) => p.id === s.phase_id);
  const color = PHASE_PALETTE[phase?.color ?? "purple"].hex;
  return (
    <section aria-label="সময়রেখা" className="mt-4 rounded-2xl bg-card p-4 shadow-float">
      {e.phases.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
          {e.phases.map((p) => (
            <li key={p.id} className={`flex items-center gap-1.5 text-micro ${p.id === s.phase_id ? "font-semibold text-ink" : "text-muted"}`}>
              <span className="h-[3px] w-4 rounded-full" style={{ background: PHASE_PALETTE[p.color].hex }} aria-hidden />
              {p.label}
            </li>
          ))}
        </ul>
      )}
      <StepContent e={e} step={step} />

      <div className="mt-4 grid gap-2">
        <input
          type="range"
          min={0}
          max={n - 1}
          value={step}
          onChange={(ev) => onStep(Number(ev.target.value))}
          aria-label="ধাপ"
          aria-valuetext={`ধাপ ${bn(step + 1)} / ${bn(n)}`}
          className="w-full accent-[var(--accent)]"
          style={{ accentColor: color }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => onStep(step - 1)}
            className="h-11 flex-1 rounded-full bg-hover text-meta font-semibold text-ink-2 transition-colors hover:bg-pressed disabled:opacity-40"
          >
            ‹ আগের
          </button>
          <button
            type="button"
            disabled={step === n - 1}
            onClick={() => onStep(step + 1)}
            className="h-11 flex-1 rounded-full bg-accent text-meta font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            পরের ›
          </button>
        </div>
      </div>
    </section>
  );
}

/** One step's text: number, phase, date, title, place, story, evidence, image and sources. */
export function StepContent({ e, step, compact = false }: { e: PublicEvent; step: number; compact?: boolean }) {
  const s = e.steps[step];
  const n = e.steps.length;
  const phase = e.phases.find((p) => p.id === s.phase_id);
  const color = PHASE_PALETTE[phase?.color ?? "purple"].hex;
  const sources = e.sources.filter((x) => s.source_ids.includes(x.id));
  return (
      <div aria-live="polite">
        <p className="text-meta font-semibold" style={{ color }}>
          ধাপ {bn(step + 1)} / {bn(n)}
          {phase && ` · ${phase.label}`}
          {s.date_label && ` · ${s.date_label}`}
        </p>
        <h2 className={`mt-1 font-bold leading-snug ${compact ? "text-body" : "text-lead"}`}>{s.title}</h2>
        {(s.place_name || s.location_precision !== "exact") && (
          <p className="mt-1 text-meta text-muted">
            {s.location_precision === "unknown" ? (
              "স্থান অজানা"
            ) : (
              <>
                {s.map_type === "route" && s.from_place_name && `${s.from_place_name} → `}
                {/* The place's own page, when it has one. */}
                {s.place_name && s.place_slug ? (
                  <PlaceLink slug={s.place_slug} source="on_this_day">
                    {s.place_name}
                  </PlaceLink>
                ) : (
                  s.place_name
                )}
              </>
            )}
            {s.location_precision === "approximate" && " (আনুমানিক)"}
          </p>
        )}
        {s.narrative && <p className={`mt-2 text-ink-2 ${compact ? "text-meta" : "text-body"}`}>{s.narrative}</p>}
        {s.evidence !== "documented" && (
          <p className="mt-2">
            <span className={`rounded px-1.5 py-0.5 text-micro ${s.evidence === "disputed" ? "bg-warning-soft text-warning" : "bg-hover text-ink-2"}`}>{EVIDENCE_BN[s.evidence]}</span>
          </p>
        )}
        {s.image && (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- Commons image, licence checked */}
            <img src={s.image.src} alt="" className="aspect-video w-full rounded-control object-cover" />
            <figcaption className="mt-1 truncate text-micro text-muted">
              ছবি:{" "}
              <a href={s.image.credit.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                {s.image.credit.author}
              </a>{" "}
              · {s.image.credit.license}
            </figcaption>
          </figure>
        )}
        {sources.length > 0 && (
          <p className="mt-2 text-micro text-muted">
            সূত্র:{" "}
            {sources.map((x, i) => (
              <span key={x.id}>
                {i > 0 && " · "}
                {x.url ? (
                  <a href={x.url} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                    {x.title}
                  </a>
                ) : (
                  x.title
                )}
              </span>
            ))}
          </p>
        )}
      </div>

  );
}

/**
 * Wide screens: the timeline's steps as a numbered list (the current one's card is a popup on the
 * map). Steps without a place on the map say so; they open their card in the map's corner.
 */
function StepList({ e, step, onStep, className = "" }: { e: PublicEvent; step: number; onStep: (n: number) => void; className?: string }) {
  return (
    <section aria-label="সময়রেখা" className={`mt-4 rounded-2xl bg-card p-3 shadow-float ${className}`}>
      <p className="px-1 text-micro font-semibold text-muted">সময়রেখা · মানচিত্রে চিহ্নে বা এখানে ধাপে ক্লিক করুন</p>
      <ol className="mt-2 grid gap-0.5">
        {e.steps.map((s, i) => {
          const phase = e.phases.find((p) => p.id === s.phase_id);
          const color = PHASE_PALETTE[phase?.color ?? "purple"].hex;
          const onMap = s.map_type !== "none" && s.location_precision !== "unknown" && s.lat !== null;
          const current = i === step;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onStep(i)}
                aria-current={current ? "step" : undefined}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-start transition-colors ${current ? "bg-accent-soft" : "hover:bg-hover"}`}
              >
                <span
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-micro font-bold ${onMap ? "text-white" : "border-[1.5px] bg-card"}`}
                  style={onMap ? { background: color } : { borderColor: color, color }}
                  aria-hidden
                >
                  {bn(i + 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-meta leading-snug ${current ? "font-semibold text-ink" : "text-ink-2"}`}>{s.title}</span>
                  <span className="block truncate text-micro text-muted">
                    {[s.date_label, onMap ? s.place_name : "মানচিত্রে নেই"].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
