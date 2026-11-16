"use client";

import { useEffect, useState } from "react";
import type { EventSource, HistoricalEvent, TimelineStep } from "@/lib/events/schema";
import { EVIDENCE_EN, EVIDENCE_LEVELS, LOCATION_PRECISION_EN, MAP_TYPE_EN } from "@/lib/events/schema";
import { AI_EVIDENCE_EN, SUGGESTED_PUBLIC_EVIDENCE, type AiEvidence, type Claim, type ResearchRun, type SuggestedStep } from "@/lib/research/types";
import { adminFetch } from "@/lib/supabase-browser";

type Loaded = { event: HistoricalEvent; sources: EventSource[]; steps: TimelineStep[]; problems: string[] };

const section = "rounded-2xl bg-card p-4 shadow-float md:p-5";
const field =
  "w-full rounded-control border border-line-strong bg-card px-3 py-2 text-meta outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-ring";
const btn = "h-9 rounded-full px-3.5 text-meta font-semibold transition-colors disabled:opacity-50";

/** The AI's own rating: muted tones only, so it never reads as an editor's verification. */
const EVIDENCE_TONE: Record<AiEvidence, string> = {
  strong: "bg-hover text-ink-2",
  moderate: "bg-hover text-ink-2",
  weak: "bg-warning-soft text-warning",
  conflicting: "bg-warning-soft text-warning",
  unverified: "bg-warning-soft text-warning",
};

/** "✦ AI suggestion": marks AI-written content. Deliberately not a check mark. */
function AiBadge() {
  return <span className="rounded-full border border-dashed border-accent/50 px-2 py-0.5 text-micro font-semibold text-accent">✦ AI suggestion</span>;
}

/**
 * AI research for an event, admin only. Start a run (Wikipedia, Wikidata and pasted URLs are
 * collected, then the AI drafts a report from them), review it claim by claim with each claim's
 * own quotes, and accept, edit or reject individual suggestions. Accepted content is added to the
 * event as an unverified draft; the AI never verifies or publishes anything.
 */
export function ResearchPanel({ data, onChange }: { data: Loaded; onChange: (d: Loaded) => void }) {
  const [runs, setRuns] = useState<ResearchRun[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch(`/api/admin/events/${data.event.id}/research`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setRuns(d.runs);
        setOpenId((cur) => cur ?? d.runs[0]?.id ?? null);
      } else setError(d.error ?? `HTTP ${r.status}`);
    });
  }, [data.event.id]);

  const open = runs?.find((r) => r.id === openId) ?? null;
  const upsert = (run: ResearchRun) => setRuns((rs) => [run, ...(rs ?? []).filter((x) => x.id !== run.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));

  return (
    <section className={`${section} mt-5`} aria-label="AI research">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">AI research</h2>
        <span className="text-micro text-muted">Admins only · nothing is verified or published automatically</span>
      </div>
      <p className="mt-1 text-meta text-muted">
        The AI collects text from Wikipedia, Wikidata and any links you give, then drafts a report. Each claim shows exact quotes from its sources; claims
        without support are marked &ldquo;unsupported&rdquo;. Anything you accept is added as an unverified draft.
      </p>
      <StartForm
        event={data.event}
        onStarted={(run) => {
          upsert(run);
          setOpenId(run.id);
        }}
        onProgressRun={upsert}
      />
      {error && <p className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{error}</p>}

      {runs && runs.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Past research runs">
          {runs.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === openId}
              onClick={() => setOpenId(r.id)}
              className={`h-8 rounded-full px-3 text-micro transition-colors ${r.id === openId ? "bg-accent text-on-accent" : "bg-hover text-ink-2 hover:bg-pressed"}`}
            >
              Run {runs.length - i} · {new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              {r.status === "failed" ? " · failed" : r.status !== "ready" ? " · running" : ""}
            </button>
          ))}
        </div>
      )}
      {open && <RunView key={open.id} run={open} data={data} onRun={upsert} onEvent={onChange} />}
    </section>
  );
}

// ── Start a run ───────────────────────────────────────────────────────────────────────────

function StartForm({ event, onStarted, onProgressRun }: { event: HistoricalEvent; onStarted: (r: ResearchRun) => void; onProgressRun: (r: ResearchRun) => void }) {
  const [title, setTitle] = useState(event.title);
  const [context, setContext] = useState("");
  const [urls, setUrls] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("Starting…");
    const list = urls
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean);
    const res = await adminFetch(`/api/admin/events/${event.id}/research`, { method: "POST", body: JSON.stringify({ title, context: context || undefined, urls: list }) }).catch(() => null);
    if (!res || !res.ok || !res.body) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setStage(null);
      return setError(d.error ?? "Couldn’t start research");
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let started = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "stage") setStage(ev.message);
        if (ev.run) {
          if (!started) onStarted(ev.run);
          else onProgressRun(ev.run);
          started = true;
        }
        if (ev.type === "error") setError(ev.message);
        if (ev.type === "done" || ev.type === "error") setStage(null);
      }
    }
    setStage(null);
  }

  return (
    <form onSubmit={start} className="mt-3 grid gap-2 rounded-control border border-line p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <label className="grid gap-1 text-meta font-semibold text-ink-2">
          Research topic
          <input value={title} onChange={(e) => setTitle(e.target.value)} required className={field} />
        </label>
        <label className="grid gap-1 text-meta font-semibold text-ink-2">
          Context (optional; searching in English works best)
          <input value={context} onChange={(e) => setContext(e.target.value)} className={field} placeholder="Bengali language movement 1952 Dhaka" />
        </label>
      </div>
      <label className="grid gap-1 text-meta font-semibold text-ink-2">
        More source links (optional, up to 5: museums, archives, research institutes…)
        <textarea rows={2} value={urls} onChange={(e) => setUrls(e.target.value)} className={field} placeholder="https://… (one per line)" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!!stage} className={`${btn} h-10 bg-accent px-4 text-on-accent hover:bg-accent-hover`}>
          {stage ? "Running…" : "Research with AI"}
        </button>
        {stage && (
          <span className="flex items-center gap-2 text-meta text-accent" role="status" aria-live="polite">
            <span className="size-3.5 animate-spin rounded-full border-2 border-accent-soft-hover border-t-accent" aria-hidden />
            {stage}
          </span>
        )}
        {error && !stage && <span className="text-meta text-warning">{error}</span>}
      </div>
    </form>
  );
}

// ── One run: sources, overview, chronology, disagreements ─────────────────────────────────

function RunView({ run, data, onRun, onEvent }: { run: ResearchRun; data: Loaded; onRun: (r: ResearchRun) => void; onEvent: (d: Loaded) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const published = data.event.status === "published";

  async function decide(key: string, body: object): Promise<boolean> {
    setBusy(key);
    setError(null);
    const r = await adminFetch(`/api/admin/events/${data.event.id}/research/${run.id}`, { method: "POST", body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setError(d.error ?? `HTTP ${r.status}`);
      return false;
    }
    onRun(d.run);
    onEvent({ event: d.event, sources: d.sources, steps: d.steps, problems: d.problems });
    return true;
  }
  const state = (key: string) => run.decisions[key]?.state;
  const r = run.draft;

  return (
    <div className="mt-4 grid gap-4">
      {published && <p className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">This event is published. Unpublish it before adding drafts.</p>}
      {run.error && <p className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{run.error}</p>}
      {error && (
        <p role="alert" className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
          {error}
        </p>
      )}

      {/* Retrieved sources */}
      <div>
        <h3 className="text-meta font-semibold text-ink-2">Collected sources ({run.sources.filter((s) => s.retrieval === "retrieved").length}/{run.sources.length})</h3>
        <ul className="mt-2 grid gap-1.5">
          {run.sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-2 rounded-control border border-line px-3 py-2 text-meta">
              <span className="font-mono text-micro text-muted">{s.id}</span>
              <span className="min-w-0 flex-1">
                <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-accent hover:underline">
                  {s.title} ↗
                </a>
                <span className="block text-micro text-muted">
                  {[s.publisher, s.author, s.published_on].filter(Boolean).join(" · ")}
                  {s.retrieval === "retrieved" ? ` · retrieved ${s.retrieved_at.slice(0, 10)}` : ""}
                </span>
                {r?.source_notes[s.id] && <span className="block text-micro text-ink-2">{r.source_notes[s.id]}</span>}
                {s.retrieval === "failed" && <span className="block text-micro text-warning">Couldn’t retrieve: {s.reason}</span>}
              </span>
              {s.retrieval === "retrieved" &&
                (state(`source.${s.id}`) === "accepted" ? (
                  <span className="text-micro text-muted">Added to event (not verified)</span>
                ) : (
                  <button type="button" disabled={!!busy || published} onClick={() => decide(`source.${s.id}`, { kind: "source", source_id: s.id })} className={`${btn} bg-accent-soft text-accent hover:bg-accent-soft-hover`}>
                    {busy === `source.${s.id}` ? "…" : "Add as source"}
                  </button>
                ))}
            </li>
          ))}
        </ul>
        {run.leads.length > 0 && (
          <details className="mt-2 text-meta">
            <summary className="cursor-pointer text-muted select-none hover:text-ink">
              Further leads ({run.leads.length}) — Wikipedia references, <span className="font-semibold">not collected</span>
            </summary>
            <p className="mt-1 text-micro text-muted">These haven’t been checked or quoted. Open the ones you need; if one helps, paste its link in the box above and run research again.</p>
            <ul className="mt-1 grid gap-0.5">
              {run.leads.map((l) => (
                <li key={l.url} className="truncate text-micro">
                  <a href={l.url} target="_blank" rel="noreferrer nofollow" className="text-muted hover:text-ink hover:underline">
                    {l.url}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {r && (
        <>
          {r.validation.length > 0 && (
            <details className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
              <summary className="cursor-pointer font-semibold select-none">Checks found {r.validation.length} {r.validation.length === 1 ? "problem" : "problems"} (misquotes by the AI or unknown sources)</summary>
              <ul className="mt-1 grid gap-0.5 text-micro">
                {r.validation.map((v, i) => (
                  <li key={i}>• {v}</li>
                ))}
              </ul>
            </details>
          )}

          {/* Overview */}
          <div className="grid gap-3">
            <h3 className="text-meta font-semibold text-ink-2">
              Overview <AiBadge />
            </h3>
            <p className="text-meta text-muted">
              Suggested title: <span className="text-ink">{r.overview.title}</span> · Date: <span className="text-ink">{r.overview.date_text ?? "Unknown"}</span> ({r.overview.date_precision === "day" ? "exact day" : r.overview.date_precision === "unknown" ? "unknown" : r.overview.date_precision === "approximate" ? "approximate" : r.overview.date_precision === "month" ? "month only" : "year only"})
              {r.overview.main_place && ` · Place: ${r.overview.main_place}`}
            </p>
            <OverviewChoice
              label="Short summary"
              claim={r.overview.summary}
              current={data.event.summary ?? null}
              state={state("overview.summary")}
              busy={busy === "overview.summary"}
              disabled={published}
              sources={run.sources}
              onAccept={(text, replace) => decide("overview.summary", { kind: "overview", field: "summary", text, replace })}
              onReject={() => decide("overview.summary", { kind: "reject", key: "overview.summary" })}
            />
            <OverviewChoice
              label="Full account (background and context)"
              claim={{
                id: "overview.narrative",
                text: [r.overview.background?.text, r.overview.context?.text].filter(Boolean).join("\n\n"),
                citations: [...(r.overview.background?.citations ?? []), ...(r.overview.context?.citations ?? [])],
                evidence: worst([r.overview.background?.evidence, r.overview.context?.evidence]),
                note: [r.overview.background?.note, r.overview.context?.note].filter(Boolean).join(" · ") || null,
              }}
              current={data.event.narrative ?? null}
              state={state("overview.narrative")}
              busy={busy === "overview.narrative"}
              disabled={published || !(r.overview.background || r.overview.context)}
              sources={run.sources}
              onAccept={(text, replace) => decide("overview.narrative", { kind: "overview", field: "narrative", text, replace })}
              onReject={() => decide("overview.narrative", { kind: "reject", key: "overview.narrative" })}
            />
          </div>

          {/* Phases */}
          {r.phases.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-meta">
              <span className="font-semibold text-ink-2">Suggested phases:</span>
              {r.phases.map((p) => (
                <span key={p.id} className="rounded-full bg-hover px-2.5 py-0.5 text-ink-2">
                  {p.label}
                </span>
              ))}
              {state("phases") === "accepted" ? (
                <span className="text-micro text-muted">Added</span>
              ) : (
                <button type="button" disabled={!!busy || published} onClick={() => decide("phases", { kind: "phases" })} className={`${btn} bg-accent-soft text-accent hover:bg-accent-soft-hover`}>
                  {busy === "phases" ? "…" : "Add phases"}
                </button>
              )}
            </div>
          )}

          {/* Chronology */}
          <div>
            <h3 className="text-meta font-semibold text-ink-2">
              Suggested timeline ({r.steps.length} {r.steps.length === 1 ? "step" : "steps"}) <AiBadge />
            </h3>
            <p className="mt-1 text-micro text-muted">Edit and add each step separately. Added steps are unverified drafts: pick the place on the map and set the evidence level yourself.</p>
            <ol className="mt-2 grid gap-2">
              {r.steps.map((s, i) => (
                <SuggestedStepCard
                  key={i}
                  step={s}
                  index={i}
                  run={run}
                  data={data}
                  busy={busy === `step.${i}`}
                  disabled={published}
                  onAccept={(fields) => decide(`step.${i}`, { kind: "step", index: i, fields })}
                  onReject={() => decide(`step.${i}`, { kind: "reject", key: `step.${i}` })}
                />
              ))}
              {!r.steps.length && <li className="text-meta text-muted">No timeline could be suggested from the collected text.</li>}
            </ol>
          </div>

          {/* Disagreements and gaps */}
          {r.disagreements.length > 0 && (
            <div>
              <h3 className="text-meta font-semibold text-warning">Disagreements and uncertainties ({r.disagreements.length})</h3>
              <ul className="mt-2 grid gap-2">
                {r.disagreements.map((d, i) => (
                  <li key={i} className="rounded-control border border-dashed border-warning/40 bg-warning-soft/40 p-3">
                    <p className="text-meta font-semibold">{d.topic}</p>
                    <ClaimBody claim={d} sources={run.sources} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.gaps.length > 0 && (
            <div>
              <h3 className="text-meta font-semibold text-ink-2">Not found in the collected sources</h3>
              <ul className="mt-1 grid gap-0.5 text-meta text-muted">
                {r.gaps.map((g, i) => (
                  <li key={i}>• {g}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-micro text-muted">Model: {run.model} · These are AI suggestions, not an editor’s verification.</p>
        </>
      )}
    </div>
  );
}

const worst = (es: (AiEvidence | undefined)[]): AiEvidence => {
  const order: AiEvidence[] = ["unverified", "conflicting", "weak", "moderate", "strong"];
  const present = es.filter((x): x is AiEvidence => !!x);
  return present.length ? order.find((o) => present.includes(o))! : "unverified";
};

/** A claim's text, the AI's rating (muted) and each citation with its quote and whether it checked out. */
function ClaimBody({ claim, sources }: { claim: Claim; sources: ResearchRun["sources"] }) {
  return (
    <>
      <p className="mt-1 text-body whitespace-pre-line text-ink-2">{claim.text}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-micro ${EVIDENCE_TONE[claim.evidence]}`}>AI’s rating: {AI_EVIDENCE_EN[claim.evidence]}</span>
        {claim.note && <span className="text-micro text-muted">{claim.note}</span>}
      </p>
      {claim.citations.length > 0 && (
        <ul className="mt-1.5 grid gap-1">
          {claim.citations.map((c, i) => {
            const s = sources.find((x) => x.id === c.source_id);
            return (
              <li key={i} className={`border-s-2 ps-2 text-micro ${c.found ? "border-line-strong text-ink-2" : "border-warning text-warning"}`}>
                <span className="font-mono">{c.source_id}</span> {s && <span className="text-muted">({s.title})</span>}: &ldquo;{c.quote}&rdquo;
                {!c.found && <span className="ms-1 font-semibold">— not found in source</span>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** A summary/narrative suggestion: edit, then accept into an empty field, or compare and replace. */
function OverviewChoice({
  label,
  claim,
  current,
  state,
  busy,
  disabled,
  sources,
  onAccept,
  onReject,
}: {
  label: string;
  claim: Claim;
  current: string | null;
  state?: "accepted" | "rejected";
  busy: boolean;
  disabled: boolean;
  sources: ResearchRun["sources"];
  onAccept: (text: string, replace: boolean) => Promise<boolean>;
  onReject: () => void;
}) {
  const [text, setText] = useState(claim.text);
  const [comparing, setComparing] = useState(false);
  const has = !!current?.trim();
  if (!claim.text) return null;
  return (
    <div className={`rounded-control border border-dashed p-3 ${state ? "border-line opacity-70" : "border-accent/40"}`}>
      <p className="text-meta font-semibold">{label}</p>
      {state ? (
        <p className="mt-1 text-micro text-muted">{state === "accepted" ? "Accepted (as a draft)" : "Rejected"}</p>
      ) : (
        <>
          <ClaimBody claim={claim} sources={sources} />
          <textarea rows={label.startsWith("Full") ? 5 : 2} value={text} onChange={(e) => setText(e.target.value)} className={`${field} mt-2`} aria-label={`${label} (editable)`} />
          {comparing && has && (
            <div className="mt-2 rounded-control bg-paper p-2 text-micro">
              <p className="font-semibold text-ink-2">Current text (will be replaced):</p>
              <p className="mt-0.5 whitespace-pre-line text-muted">{current}</p>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {!has ? (
              <button type="button" disabled={busy || disabled} onClick={() => onAccept(text, false)} className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}>
                {busy ? "…" : "Add as draft"}
              </button>
            ) : !comparing ? (
              <button type="button" disabled={busy || disabled} onClick={() => setComparing(true)} className={`${btn} bg-accent-soft text-accent hover:bg-accent-soft-hover`}>
                Compare with current text
              </button>
            ) : (
              <button type="button" disabled={busy || disabled} onClick={() => onAccept(text, true)} className={`${btn} bg-warning-soft text-warning hover:bg-warning-soft-hover`}>
                {busy ? "…" : "Replace current text"}
              </button>
            )}
            <button type="button" disabled={busy} onClick={onReject} className={`${btn} text-muted hover:text-ink`}>
              Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** A suggested step: shown with its quotes; edited (title, text, evidence level, precision) before adding. */
function SuggestedStepCard({
  step: s,
  index,
  run,
  data,
  busy,
  disabled,
  onAccept,
  onReject,
}: {
  step: SuggestedStep;
  index: number;
  run: ResearchRun;
  data: Loaded;
  busy: boolean;
  disabled: boolean;
  onAccept: (fields: object) => Promise<boolean>;
  onReject: () => void;
}) {
  const decided = run.decisions[`step.${index}`]?.state;
  const duplicate = data.steps.some((x) => x.title.trim().toLowerCase() === s.title.trim().toLowerCase());
  const [editing, setEditing] = useState(false);
  // The form's starting values (taken when it is opened, so phases accepted meanwhile are offered).
  const initial = () => ({
    title: s.title,
    narrative: [s.text, s.significance && `গুরুত্ব: ${s.significance}`, s.uncertainty && `অনিশ্চয়তা: ${s.uncertainty}`].filter(Boolean).join("\n\n"),
    date_label: s.date_label ?? "",
    evidence: SUGGESTED_PUBLIC_EVIDENCE[s.evidence],
    phase_id: data.event.phases?.some((p) => p.id === s.phase) ? s.phase! : (data.event.phases?.[0]?.id ?? ""),
  });
  const [f, setF] = useState(initial);
  const found = s.citations.filter((c) => c.found).length;

  return (
    <li className={`rounded-control border border-dashed p-3 ${decided ? "border-line opacity-70" : "border-accent/40"}`}>
      <div className="flex flex-wrap items-start gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-micro font-semibold text-accent">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{s.title}</p>
          <p className="text-micro text-muted">
            {[s.date_label, s.place_name ? `${s.from_place_name ? `${s.from_place_name} → ` : ""}${s.place_name}` : "Location unknown", LOCATION_PRECISION_EN[s.location_precision], MAP_TYPE_EN[s.map_type]].filter(Boolean).join(" · ")}
          </p>
        </div>
        {decided && <span className="text-micro text-muted">{decided === "accepted" ? "Added to timeline (not verified)" : "Rejected"}</span>}
      </div>
      {!decided && (
        <>
          <ClaimBody claim={s} sources={run.sources} />
          {s.uncertainty && <p className="mt-1 text-micro text-warning">Uncertainty: {s.uncertainty}</p>}
          {!found && <p className="mt-1 text-micro text-warning">None of the collected sources support this; if added, no source will be linked.</p>}
          {duplicate && <p className="mt-1 text-micro text-warning">A step with this title already exists.</p>}
          {editing ? (
            <div className="mt-2 grid gap-2 rounded-control bg-paper p-3">
              <label className="grid gap-1 text-micro font-semibold text-ink-2">
                Title
                <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={field} />
              </label>
              <label className="grid gap-1 text-micro font-semibold text-ink-2">
                Narrative
                <textarea rows={4} value={f.narrative} onChange={(e) => setF({ ...f, narrative: e.target.value })} className={field} />
              </label>
              <div className="grid gap-2 md:grid-cols-3">
                <label className="grid gap-1 text-micro font-semibold text-ink-2">
                  Time description
                  <input value={f.date_label} onChange={(e) => setF({ ...f, date_label: e.target.value })} className={field} />
                </label>
                <label className="grid gap-1 text-micro font-semibold text-ink-2">
                  Evidence (your call)
                  <select value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value as typeof f.evidence })} className={field}>
                    {EVIDENCE_LEVELS.map((x) => (
                      <option key={x} value={x}>
                        {EVIDENCE_EN[x]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-micro font-semibold text-ink-2">
                  Phase
                  <select value={f.phase_id} onChange={(e) => setF({ ...f, phase_id: e.target.value })} className={field}>
                    <option value="">—</option>
                    {(data.event.phases ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-micro text-muted">
                Place: {s.place_name ?? "unknown"}. After adding, &ldquo;Edit&rdquo; the step to pick the place on the map; the AI never gives coordinates. The step is added unverified.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || disabled || !f.title.trim()}
                  onClick={async () => {
                    const ok = await onAccept({
                      title: f.title,
                      narrative: f.narrative,
                      date_label: f.date_label,
                      phase_id: f.phase_id || null,
                      evidence: f.evidence,
                      // Coordinates are never taken from the AI: the place is resolved in the map picker afterwards.
                      map_type: "none",
                      location_precision: s.location_precision === "unknown" ? "unknown" : s.location_precision,
                      place_name: s.place_name,
                    });
                    if (ok) setEditing(false);
                  }}
                  className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}
                >
                  {busy ? "…" : "Add to timeline as draft"}
                </button>
                <button type="button" onClick={() => setEditing(false)} className={`${btn} text-muted hover:text-ink`}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy || disabled} onClick={() => {
                  setF(initial());
                  setEditing(true);
                }}
                className={`${btn} bg-accent-soft text-accent hover:bg-accent-soft-hover`}>
                Edit and add
              </button>
              <button type="button" disabled={busy} onClick={onReject} className={`${btn} text-muted hover:text-ink`}>
                Reject
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
