"use client";

import { useState } from "react";
import { drawsOnMap, stepColor } from "@/lib/events/draw";
import {
  EVIDENCE_BN,
  EVIDENCE_LEVELS,
  LOCATION_PRECISION_BN,
  LOCATION_PRECISIONS,
  MAP_TYPE_BN,
  MAP_TYPES,
  PHASE_COLORS,
  PHASE_PALETTE,
  type EventSource,
  type HistoricalEvent,
  type PhaseColor,
  type PhaseT,
  type TimelineStep,
} from "@/lib/events/schema";
import { adminFetch } from "@/lib/supabase-browser";
import { ImagePicker } from "./ImagePicker";
import { MapPicker, type PickedPlace } from "./MapPicker";
import { TimelinePreview } from "./TimelinePreview";

type Loaded = { event: HistoricalEvent; sources: EventSource[]; steps: TimelineStep[]; problems: string[] };

const field =
  "w-full rounded-control border border-line-strong bg-card px-3 py-2 text-meta outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-ring";
const label = "grid gap-1 text-meta font-semibold text-ink-2";
const section = "rounded-2xl bg-card p-4 shadow-float md:p-5";
const btn = "h-10 rounded-full px-4 text-meta font-semibold transition-colors disabled:opacity-50";
const bn = (n: number) => n.toLocaleString("bn-BD");

/** Phases, the step list (ordering, edit), and the interactive preview. */
export function TimelinePanel({ data, onChange }: { data: Loaded; onChange: (d: Loaded) => void }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<{ message: string; problems?: string[] } | null>(null);

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    const r = await adminFetch(`/api/admin/events/${data.event.id}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError({ message: d.issues?.[0]?.message ?? d.error ?? `HTTP ${r.status}`, problems: d.problems });
      return false;
    }
    onChange(d);
    return true;
  }

  return (
    <>
      <PhasesEditor phases={data.event.phases ?? []} onSave={(phases) => call("/phases", "PUT", { phases })} />

      <section className={`${section} mt-5`} aria-label="টাইমলাইন">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">টাইমলাইন ({bn(data.steps.length)} ধাপ)</h2>
          {editing === null && (
            <button type="button" onClick={() => setEditing("new")} className={`${btn} ms-auto bg-accent-soft text-accent hover:bg-accent-soft-hover`}>
              + ধাপ যোগ করুন
            </button>
          )}
        </div>
        <p className="mt-1 text-meta text-muted">টেনে বা ↑ ↓ দিয়ে ক্রম বদলান। প্রতিটি ধাপে অন্তত একটি সূত্র যুক্ত করে তবেই যাচাই করা চিহ্ন দিন।</p>
        {error && (
          <div role="alert" className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">
            <p className="font-semibold">{error.message}</p>
            {error.problems?.map((p) => <p key={p}>• {p}</p>)}
          </div>
        )}
        <StepList data={data} editing={editing} onEdit={setEditing} onReorder={(ids) => call("/steps/reorder", "PUT", { step_ids: ids })} />
        {editing && (
          <StepForm
            key={editing}
            data={data}
            step={editing === "new" ? undefined : data.steps.find((s) => s.id === editing)}
            onCancel={() => setEditing(null)}
            onSave={async (body) => {
              const ok = editing === "new" ? await call("/steps", "POST", body) : await call(`/steps/${editing}`, "PUT", body);
              if (ok) setEditing(null);
            }}
            onDelete={editing === "new" ? undefined : async () => (await call(`/steps/${editing}`, "DELETE")) && setEditing(null)}
          />
        )}
      </section>

      <section className={`${section} mt-5`} aria-label="প্রিভিউ">
        <h2 className="font-semibold">প্রিভিউ</h2>
        <p className="mt-1 text-meta text-muted">দর্শকেরা যেমন দেখবেন: ধাপে ধাপে এগিয়ে দেখুন।</p>
        <div className="mt-3">
          <TimelinePreview event={data.event} steps={data.steps} />
        </div>
      </section>
    </>
  );
}

// ── Phases ────────────────────────────────────────────────────────────────────────────────

function PhasesEditor({ phases, onSave }: { phases: PhaseT[]; onSave: (p: PhaseT[]) => Promise<boolean> }) {
  const [list, setList] = useState<PhaseT[]>(phases);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  // Compared field by field (the database may return each phase's keys in another order).
  const same = (a: PhaseT[], b: PhaseT[]) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.label === b[i].label && x.color === b[i].color);
  const dirty = !same(list, phases);
  const used = new Set(list.map((p) => p.color));
  const slug = (s: string, i: number) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `phase-${i + 1}`;

  return (
    <section className={`${section} mt-5`} aria-label="পর্ব">
      <h2 className="font-semibold">পর্ব ও রং ({bn(list.length)}/৪)</h2>
      <p className="mt-1 text-meta text-muted">ঘটনার ধাপগুলোকে ১–৪টি পর্বে ভাগ করুন (যেমন: অভিযান, হামলা, দাফন)। প্রতিটি পর্বের একটি নির্দিষ্ট রং।</p>
      <ul className="mt-3 grid gap-2">
        {list.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="size-4 shrink-0 rounded-full" style={{ background: PHASE_PALETTE[p.color].hex }} aria-hidden />
            <input
              value={p.label}
              onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              placeholder="পর্বের নাম"
              className={`${field} min-w-40 flex-1`}
              aria-label="পর্বের নাম"
            />
            <input
              value={p.id}
              onChange={(e) => setList((l) => l.map((x, j) => (j === i ? { ...x, id: slug(e.target.value, j) } : x)))}
              className={`${field} w-32 font-mono`}
              aria-label="পর্বের আইডি (ইংরেজি)"
              title="পর্বের আইডি (ইংরেজি)"
            />
            <div className="flex gap-1" role="radiogroup" aria-label="রং">
              {PHASE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={p.color === c}
                  aria-label={PHASE_PALETTE[c].bn}
                  title={PHASE_PALETTE[c].bn}
                  disabled={used.has(c) && p.color !== c}
                  onClick={() => setList((l) => l.map((x, j) => (j === i ? { ...x, color: c } : x)))}
                  className={`size-7 rounded-full transition-transform disabled:opacity-20 ${p.color === c ? "ring-2 ring-ink ring-offset-2" : "hover:scale-110"}`}
                  style={{ background: PHASE_PALETTE[c].hex }}
                />
              ))}
            </div>
            <button type="button" onClick={() => setList((l) => l.filter((_, j) => j !== i))} className="text-meta text-danger hover:underline">
              সরান
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {list.length < 4 && (
          <button
            type="button"
            onClick={() => {
              const color = PHASE_COLORS.find((c) => !used.has(c)) as PhaseColor;
              setList((l) => [...l, { id: `phase-${l.length + 1}`, label: "", color }]);
              setSaved(false);
            }}
            className={`${btn} bg-hover text-ink-2 hover:bg-pressed`}
          >
            + পর্ব
          </button>
        )}
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onSave(list);
            setBusy(false);
            setSaved(ok);
          }}
          className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}
        >
          {busy ? "…" : "পর্ব সংরক্ষণ"}
        </button>
        {saved && !dirty && <span className="text-meta text-success">✓ সংরক্ষিত</span>}
      </div>
    </section>
  );
}

// ── Step list: drag and drop, or ↑ ↓ ───────────────────────────────────────────────────────

function StepList({
  data,
  editing,
  onEdit,
  onReorder,
}: {
  data: Loaded;
  editing: string | null;
  onEdit: (id: string) => void;
  onReorder: (ids: string[]) => Promise<boolean>;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const ids = order ?? data.steps.map((s) => s.id);
  const byId = new Map(data.steps.map((s) => [s.id, s]));
  const phases = data.event.phases ?? [];

  async function commit(next: string[]) {
    setOrder(next);
    await onReorder(next);
    setOrder(null); // the server's order (the same, or the old one if it failed) takes over
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
  };

  if (!ids.length) return <p className="mt-3 text-meta text-muted">এখনো কোনো ধাপ নেই। ধাপ ছাড়াও ঘটনা প্রকাশ করা যায় (শুধু গল্প হিসেবে)।</p>;

  return (
    <ol className="mt-3 grid gap-1.5">
      {ids.map((id, i) => {
        const s = byId.get(id);
        if (!s) return null;
        const color = stepColor(phases, s.phase_id);
        return (
          <li
            key={id}
            draggable
            onDragStart={(e) => {
              setDragId(id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragId || dragId === id) return;
              const next = ids.filter((x) => x !== dragId);
              next.splice(next.indexOf(id) + (ids.indexOf(dragId) < i ? 1 : 0), 0, dragId);
              setOrder(next);
            }}
            onDragEnd={() => {
              setDragId(null);
              if (order && order.join() !== data.steps.map((x) => x.id).join()) commit(order);
              else setOrder(null);
            }}
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border bg-card px-2 py-2 transition-shadow sm:flex-nowrap ${editing === id ? "border-accent" : "border-line"} ${dragId === id ? "opacity-50 shadow-menu" : ""}`}
          >
            <span className="cursor-grab px-1 text-subtle select-none active:cursor-grabbing" aria-hidden title="টেনে সরান">
              ⠿
            </span>
            <span className="grid size-6 shrink-0 place-items-center rounded-full text-micro font-semibold text-white" style={{ background: color }}>
              {bn(i + 1)}
            </span>
            <span className="min-w-0 flex-1 basis-40">
              <span className="block truncate font-semibold">{s.title}</span>
              <span className="block truncate text-micro text-muted">
                {[s.date_label, MAP_TYPE_BN[s.map_type], s.location_precision !== "exact" && LOCATION_PRECISION_BN[s.location_precision], s.place_name].filter(Boolean).join(" · ")}
              </span>
            </span>
            {/* On a phone these move to a second line (the row wraps). */}
            <span className="ms-auto flex shrink-0 gap-1 sm:ms-0">
              <span className={`rounded-full px-2 py-0.5 text-micro ${s.source_ids.length ? "bg-hover text-ink-2" : "bg-warning-soft text-warning"}`}>সূত্র {bn(s.source_ids.length)}</span>
              <span className={`rounded-full px-2 py-0.5 text-micro ${s.verified ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{s.verified ? "✓ যাচাই" : "যাচাই হয়নি"}</span>
            </span>
            <span className="flex shrink-0">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`ধাপ ${bn(i + 1)} ওপরে`} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-hover disabled:opacity-25">
                ↑
              </button>
              <button
                type="button"
                disabled={i === ids.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`ধাপ ${bn(i + 1)} নিচে`}
                className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-hover disabled:opacity-25"
              >
                ↓
              </button>
            </span>
            <button type="button" onClick={() => onEdit(id)} className="text-meta font-semibold text-accent hover:underline">
              সম্পাদনা
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ── Step form ─────────────────────────────────────────────────────────────────────────────

type Draft = {
  title: string;
  narrative: string;
  date_label: string;
  sort_minutes: string;
  phase_id: string;
  map_type: TimelineStep["map_type"];
  location_precision: TimelineStep["location_precision"];
  to: PickedPlace | null;
  from: PickedPlace | null;
  /** The names visitors see (typed by the editor; the map only fills them when empty). */
  place_name: string;
  from_place_name: string;
  radius_m: number;
  image: TimelineStep["image"];
  evidence: TimelineStep["evidence"];
  verified: boolean;
  source_ids: string[];
};

function StepForm({
  data,
  step,
  onSave,
  onCancel,
  onDelete,
}: {
  data: Loaded;
  step?: TimelineStep;
  onSave: (body: unknown) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const phases = data.event.phases ?? [];
  const [d, setD] = useState<Draft>(() => ({
    title: step?.title ?? "",
    narrative: step?.narrative ?? "",
    date_label: step?.date_label ?? "",
    sort_minutes: step?.sort_minutes?.toString() ?? "",
    phase_id: step?.phase_id ?? phases[0]?.id ?? "",
    map_type: step?.map_type ?? "marker",
    location_precision: step?.location_precision ?? "exact",
    to: step?.lat !== null && step?.lat !== undefined ? { name: step.place_name ?? null, lat: step.lat, lng: step.lng! } : null,
    from: step?.from_lat !== null && step?.from_lat !== undefined ? { name: step.from_place_name ?? null, lat: step.from_lat, lng: step.from_lng! } : null,
    place_name: step?.place_name ?? "",
    from_place_name: step?.from_place_name ?? "",
    radius_m: step?.radius_m ?? 800,
    image: step?.image ?? null,
    evidence: step?.evidence ?? "documented",
    verified: step?.verified ?? false,
    source_ids: step?.source_ids ?? [],
  }));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const color = stepColor(phases, d.phase_id);
  const showsMap = d.map_type !== "none" && d.location_precision !== "unknown";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({
      title: d.title,
      narrative: d.narrative,
      date_label: d.date_label,
      sort_minutes: d.sort_minutes.trim() === "" ? null : Number(d.sort_minutes),
      phase_id: d.phase_id || null,
      map_type: d.map_type,
      location_precision: d.location_precision,
      place_name: d.place_name.trim() || d.to?.name || "",
      lat: d.to?.lat ?? null,
      lng: d.to?.lng ?? null,
      from_place_name: d.from_place_name.trim() || d.from?.name || "",
      from_lat: d.from?.lat ?? null,
      from_lng: d.from?.lng ?? null,
      radius_m: d.map_type === "area" ? d.radius_m : null,
      image: d.image ?? null,
      evidence: d.evidence,
      verified: d.verified && d.source_ids.length > 0,
      source_ids: d.source_ids,
    });
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="mt-4 grid gap-4 rounded-2xl border border-accent/40 bg-paper p-4" aria-label={step ? "ধাপ সম্পাদনা" : "নতুন ধাপ"}>
      <h3 className="font-semibold">{step ? `ধাপ ${bn(step.position + 1)} সম্পাদনা` : "নতুন ধাপ"}</h3>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <label className={label}>
          শিরোনাম
          <input required value={d.title} onChange={(e) => set("title", e.target.value)} className={field} placeholder="যেমন: সেনাবাহিনী রাজারবাগের দিকে" />
        </label>
        <label className={label}>
          পর্ব
          <select value={d.phase_id} onChange={(e) => set("phase_id", e.target.value)} className={field}>
            {!phases.length && <option value="">আগে পর্ব যোগ করুন</option>}
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label || p.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={label}>
        বিবরণ
        <textarea rows={3} value={d.narrative} onChange={(e) => set("narrative", e.target.value)} className={field} />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={label}>
          সময়ের বর্ণনা (যেমন সূত্রে আছে)
          <input value={d.date_label} onChange={(e) => set("date_label", e.target.value)} className={field} placeholder="রাত সাড়ে ১১টা নাগাদ" />
        </label>
        <label className={label}>
          স্লাইডারের সময় (মিনিট, ঐচ্ছিক)
          <input type="number" value={d.sort_minutes} onChange={(e) => set("sort_minutes", e.target.value)} className={field} placeholder="সময় জানা না থাকলে খালি রাখুন" />
        </label>
      </div>

      <fieldset className="grid gap-3 rounded-control border border-line p-3">
        <legend className="px-1 text-meta font-semibold text-ink-2">মানচিত্রে</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={label}>
            কী দেখাবে
            <select value={d.map_type} onChange={(e) => set("map_type", e.target.value as Draft["map_type"])} className={field}>
              {MAP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MAP_TYPE_BN[t]}
                </option>
              ))}
            </select>
          </label>
          <div className={label}>
            স্থান কতটা নিশ্চিত
            <div className="flex gap-1 rounded-full bg-hover p-1" role="radiogroup" aria-label="স্থান কতটা নিশ্চিত">
              {LOCATION_PRECISIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={d.location_precision === p}
                  onClick={() => set("location_precision", p)}
                  className={`h-8 flex-1 rounded-full text-meta font-normal transition-colors ${d.location_precision === p ? "bg-card font-semibold text-accent shadow-float" : "text-ink-2"}`}
                >
                  {LOCATION_PRECISION_BN[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {d.location_precision === "unknown" && <p className="text-meta text-muted">অজানা স্থান: মানচিত্রে কোনো চিহ্ন দেখাবে না, মানচিত্রও সরবে না।</p>}
        {d.location_precision === "approximate" && <p className="text-meta text-muted">আনুমানিক স্থান: নির্দিষ্ট বিন্দুর বদলে একটি ঝাপসা বৃত্ত দেখাবে।</p>}
        {/* The names visitors read (also for unknown places, as text): typed here, or filled from the map once. */}
        <div className={`grid gap-3 ${d.map_type === "route" && showsMap ? "md:grid-cols-2" : ""}`}>
          {d.map_type === "route" && showsMap && (
            <label className={label}>
              শুরুর স্থানের নাম
              <input value={d.from_place_name} onChange={(e) => set("from_place_name", e.target.value)} className={field} placeholder="যেমন: চট্টগ্রাম সেনানিবাস" />
            </label>
          )}
          <label className={label}>
            {d.map_type === "route" && showsMap ? "গন্তব্যের নাম" : "স্থানের নাম"} <span className="font-normal text-muted">(দর্শকেরা যা দেখবেন)</span>
            <input value={d.place_name} onChange={(e) => set("place_name", e.target.value)} className={field} placeholder="যেমন: প্যারেড স্কয়ার, চট্টগ্রাম" />
          </label>
        </div>
        {showsMap && (
          <MapPicker
            key={d.map_type}
            mode={d.map_type as "marker" | "route" | "area"}
            to={d.to}
            from={d.from}
            radiusM={d.radius_m}
            color={color}
            approximate={d.location_precision === "approximate"}
            around={data.event.lat !== null && data.event.lat !== undefined ? { lat: data.event.lat, lng: data.event.lng! } : null}
            onChange={(v) =>
              setD((p) => ({
                ...p,
                ...(v.to !== undefined ? { to: v.to } : {}),
                ...(v.from !== undefined ? { from: v.from } : {}),
                ...(v.radiusM !== undefined ? { radius_m: v.radiusM } : {}),
                // The map's name only fills an empty box: a name the editor typed is kept.
                ...(v.to?.name && !p.place_name.trim() ? { place_name: v.to.name } : {}),
                ...(v.from?.name && !p.from_place_name.trim() ? { from_place_name: v.from.name } : {}),
              }))
            }
          />
        )}
      </fieldset>

      <div className={label}>
        ছবি (ঐচ্ছিক)
        <ImagePicker value={d.image} near={d.to} onChange={(v) => set("image", v)} />
      </div>

      <fieldset className="grid gap-2 rounded-control border border-line p-3">
        <legend className="px-1 text-meta font-semibold text-ink-2">সূত্র ও যাচাই</legend>
        {!data.sources.length && <p className="text-meta text-warning">এই ঘটনায় এখনো কোনো সূত্র নেই। ওপরে &ldquo;সূত্র&rdquo; অংশে আগে সূত্র যোগ করুন।</p>}
        {data.sources.map((s) => (
          <label key={s.id} className="flex items-start gap-2 text-meta">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--accent)]"
              checked={d.source_ids.includes(s.id)}
              onChange={(e) => {
                const next = e.target.checked ? [...d.source_ids, s.id] : d.source_ids.filter((x) => x !== s.id);
                setD((p) => ({ ...p, source_ids: next, verified: next.length ? p.verified : false }));
              }}
            />
            <span>
              {s.title}
              {!s.verified && <span className="ms-1 text-micro text-warning">(সূত্রটি নিজেই এখনো যাচাই হয়নি)</span>}
            </span>
          </label>
        ))}
        <label className={label}>
          প্রমাণের ধরন
          <select value={d.evidence} onChange={(e) => set("evidence", e.target.value as Draft["evidence"])} className={`${field} md:w-64`}>
            {EVIDENCE_LEVELS.map((x) => (
              <option key={x} value={x}>
                {EVIDENCE_BN[x]}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex items-start gap-2 text-meta ${d.source_ids.length ? "" : "opacity-50"}`}>
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--accent)]"
            disabled={!d.source_ids.length}
            checked={d.verified && d.source_ids.length > 0}
            onChange={(e) => set("verified", e.target.checked)}
          />
          <span>
            <span className="font-semibold">যাচাই করা</span>
            <span className="block text-muted">{d.source_ids.length ? "যুক্ত সূত্রের সঙ্গে মিলিয়ে দেখেছি" : "আগে অন্তত একটি সূত্র যুক্ত করুন"}</span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className={`${btn} bg-accent text-on-accent hover:bg-accent-hover`}>
          {busy ? "…" : step ? "ধাপ সংরক্ষণ" : "ধাপ যোগ করুন"}
        </button>
        <button type="button" onClick={onCancel} className={`${btn} text-muted hover:text-ink`}>
          বাতিল
        </button>
        {onDelete &&
          (confirmDelete ? (
            <button type="button" onClick={onDelete} className={`${btn} ms-auto bg-danger text-white`}>
              নিশ্চিতভাবে মুছুন
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={`${btn} ms-auto text-danger hover:bg-hover`}>
              ধাপ মুছুন
            </button>
          ))}
      </div>
      {!drawsOnMap({ map_type: d.map_type, location_precision: d.location_precision, lat: d.to?.lat ?? null }) && d.map_type !== "none" && d.location_precision !== "unknown" && (
        <p className="text-meta text-warning">স্থান এখনো বেছে নেওয়া হয়নি।</p>
      )}
    </form>
  );
}
