"use client";

import { useState } from "react";
import type { AiStoryDataT } from "@/lib/ai/types";
import { periodDisplay, periodStart } from "@/lib/format";

type Confidence = "high" | "medium" | "low";
type Evidence = "documented" | "scholarly" | "tradition" | "legend" | "disputed";
const EVIDENCE_LABEL: Record<Evidence, string> = {
  documented: "নথিভুক্ত",
  scholarly: "গবেষকদের ব্যাখ্যা",
  tradition: "লোকঐতিহ্য",
  legend: "কিংবদন্তি",
  disputed: "বিতর্কিত",
};

const input = "w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm outline-none focus:border-accent";
const CONF_LABEL: Record<Confidence, string> = { high: "নিশ্চিত", medium: "সম্ভবত", low: "অনিশ্চিত" };

/**
 * Edit a saved story: the text fields an editor usually fixes, period by
 * period, plus a raw JSON mode for anything else. The server checks the
 * structure before saving.
 */
export function StoryEditor({
  story,
  saving,
  onSave,
}: {
  story: AiStoryDataT;
  saving: boolean;
  onSave: (story: AiStoryDataT) => void;
}) {
  const [s, setS] = useState<AiStoryDataT>(() => structuredClone(story));
  const [json, setJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const edit = (fn: (d: AiStoryDataT) => void) =>
    setS((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });

  if (json !== null) {
    return (
      <div className="mt-4 grid gap-2 pb-16">
        <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={28} className={`${input} font-mono text-xs`} spellCheck={false} />
        {jsonError && <p className="text-sm text-red-800">{jsonError}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              try {
                setJsonError(null);
                onSave(JSON.parse(json));
              } catch (e) {
                setJsonError("JSON ঠিক নেই: " + (e as Error).message);
              }
            }}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
          </button>
          <button type="button" onClick={() => setJson(null)} className="text-sm text-muted underline">
            ফর্মে ফিরুন
          </button>
        </div>
      </div>
    );
  }

  /** Saved in chronological order, whatever order the editor added periods in. */
  const save = () => onSave({ ...s, periods: [...s.periods].sort((a, b) => periodStart(a) - periodStart(b)) });

  return (
    <div className="mt-4 grid gap-5 pb-24">
      <Field label="নাম (বাংলা)">
        <input className={input} value={s.name_bn} onChange={(e) => edit((d) => void (d.name_bn = e.target.value))} />
      </Field>
      <Field label="Name (English)">
        <input className={input} value={s.name_en} onChange={(e) => edit((d) => void (d.name_en = e.target.value))} />
      </Field>
      <Field label="সারসংক্ষেপ">
        <textarea className={input} rows={4} value={s.summary_bn} onChange={(e) => edit((d) => void (d.summary_bn = e.target.value))} />
      </Field>
      <Field label="নামের গল্প">
        <textarea
          className={input}
          rows={3}
          value={s.name_story_bn ?? ""}
          onChange={(e) => edit((d) => void (d.name_story_bn = e.target.value || undefined))}
        />
      </Field>
      <Field label="ইতিহাসে গুরুত্ব">
        <textarea
          className={input}
          rows={2}
          value={s.historical_significance_bn ?? ""}
          onChange={(e) => edit((d) => void (d.historical_significance_bn = e.target.value || undefined))}
        />
      </Field>

      {s.periods.map((p, pi) => {
        const meta = periodDisplay(p, pi, s.country);
        return (
          <section key={pi} className="rounded-2xl border-2 p-3" style={{ borderColor: `${meta.hex}66` }}>
            <div className="flex items-center gap-2">
              <input
                className={`${input} font-bold`}
                style={{ color: meta.hex }}
                value={p.label_bn ?? ""}
                // v1 stories have a fixed period key: show its name until the editor writes their own.
                placeholder={meta.bn}
                onChange={(e) => edit((d) => void (d.periods[pi].label_bn = e.target.value || undefined))}
              />
              <button
                type="button"
                onClick={() => edit((d) => void d.periods.splice(pi, 1))}
                className="shrink-0 text-xs text-red-800 underline"
              >
                পুরো আমল মুছুন
              </button>
            </div>
            <div className="mt-1.5 flex gap-2">
              <input
                className={input}
                placeholder={meta.range || "সময়কাল, যেমন ১৫৭৬–১৭৫৭"}
                value={p.range_bn ?? ""}
                onChange={(e) => edit((d) => void (d.periods[pi].range_bn = e.target.value || undefined))}
              />
              <input
                type="number"
                title="শুরুর সাল (সাজানোর জন্য; খ্রিস্টপূর্ব হলে ঋণাত্মক)"
                placeholder="শুরু"
                className={`${input} w-24`}
                value={p.start_year ?? ""}
                onChange={(e) => edit((d) => void (d.periods[pi].start_year = e.target.value === "" ? undefined : Number(e.target.value)))}
              />
              <input
                type="number"
                title="শেষের সাল (চলমান হলে খালি)"
                placeholder="শেষ"
                className={`${input} w-24`}
                value={p.end_year ?? ""}
                onChange={(e) => edit((d) => void (d.periods[pi].end_year = e.target.value === "" ? undefined : Number(e.target.value)))}
              />
            </div>
            <textarea
              className={`${input} mt-2`}
              rows={2}
              value={p.intro_bn}
              onChange={(e) => edit((d) => void (d.periods[pi].intro_bn = e.target.value))}
            />

            <p className="mt-3 text-xs font-semibold text-muted">ঘটনা</p>
            {(p.events ?? []).map((ev, i) => (
              <Item
                key={i}
                confidence={ev.confidence}
                onConfidence={(c) => edit((d) => void (d.periods[pi].events![i].confidence = c))}
                evidence={evidenceOf(p.events?.[i]?.evidence_level)}
                onEvidence={(v) => edit((d) => void (d.periods[pi].events![i].evidence_level = v))}
                onDelete={() => edit((d) => void d.periods[pi].events!.splice(i, 1))}
              >
                <div className="flex gap-2">
                  <input
                    className={`${input} w-32`}
                    value={ev.when_bn}
                    onChange={(e) => edit((d) => void (d.periods[pi].events![i].when_bn = e.target.value))}
                  />
                  <input
                    type="number"
                    title="সাজানোর জন্য সাল"
                    className={`${input} w-24`}
                    value={ev.sort_year}
                    onChange={(e) => edit((d) => void (d.periods[pi].events![i].sort_year = Number(e.target.value)))}
                  />
                  <input className={input} value={ev.title_bn} onChange={(e) => edit((d) => void (d.periods[pi].events![i].title_bn = e.target.value))} />
                </div>
                <textarea
                  className={`${input} mt-1.5`}
                  rows={2}
                  value={ev.body_bn}
                  onChange={(e) => edit((d) => void (d.periods[pi].events![i].body_bn = e.target.value))}
                />
              </Item>
            ))}
            <AddButton
              label="ঘটনা"
              onClick={() =>
                edit((d) => void (d.periods[pi].events ??= []).push({ when_bn: "", sort_year: 0, title_bn: "", body_bn: "", confidence: "high" }))
              }
            />

            <p className="mt-3 text-xs font-semibold text-muted">ব্যক্তি</p>
            {(p.people ?? []).map((x, i) => (
              <Item
                key={i}
                confidence={x.confidence}
                onConfidence={(c) => edit((d) => void (d.periods[pi].people![i].confidence = c))}
                evidence={evidenceOf(p.people?.[i]?.evidence_level)}
                onEvidence={(v) => edit((d) => void (d.periods[pi].people![i].evidence_level = v))}
                onDelete={() => edit((d) => void d.periods[pi].people!.splice(i, 1))}
              >
                <div className="flex gap-2">
                  <input className={input} value={x.name_bn} onChange={(e) => edit((d) => void (d.periods[pi].people![i].name_bn = e.target.value))} />
                  <input className={input} value={x.role_bn} onChange={(e) => edit((d) => void (d.periods[pi].people![i].role_bn = e.target.value))} />
                </div>
                <textarea
                  className={`${input} mt-1.5`}
                  rows={2}
                  value={x.body_bn}
                  onChange={(e) => edit((d) => void (d.periods[pi].people![i].body_bn = e.target.value))}
                />
              </Item>
            ))}
            <AddButton
              label="ব্যক্তি"
              onClick={() => edit((d) => void (d.periods[pi].people ??= []).push({ name_bn: "", role_bn: "", body_bn: "", confidence: "high" }))}
            />

            <p className="mt-3 text-xs font-semibold text-muted">জানেন কি?</p>
            {(p.facts ?? []).map((f, i) => (
              <Item
                key={i}
                confidence={f.confidence}
                onConfidence={(c) => edit((d) => void (d.periods[pi].facts![i].confidence = c))}
                evidence={evidenceOf(p.facts?.[i]?.evidence_level)}
                onEvidence={(v) => edit((d) => void (d.periods[pi].facts![i].evidence_level = v))}
                onDelete={() => edit((d) => void d.periods[pi].facts!.splice(i, 1))}
              >
                <input className={input} value={f.title_bn} onChange={(e) => edit((d) => void (d.periods[pi].facts![i].title_bn = e.target.value))} />
                <textarea
                  className={`${input} mt-1.5`}
                  rows={2}
                  value={f.body_bn}
                  onChange={(e) => edit((d) => void (d.periods[pi].facts![i].body_bn = e.target.value))}
                />
              </Item>
            ))}
            <AddButton label="তথ্য" onClick={() => edit((d) => void (d.periods[pi].facts ??= []).push({ title_bn: "", body_bn: "", confidence: "high" }))} />
          </section>
        );
      })}

      <button
        type="button"
        onClick={() =>
          edit((d) => {
            const last = d.periods.at(-1);
            d.periods.push({ label_bn: "", start_year: last ? (last.end_year ?? periodStart(last) + 1) : 0, intro_bn: "" });
          })
        }
        className="justify-self-start rounded-full border border-line bg-card px-3 py-1 text-sm"
      >
        + নতুন আমল
      </button>

      <Field label="এখানে যা আছে">
        {(s.places_here ?? []).map((x, i) => (
          <div key={i} className="mb-1.5 flex gap-2">
            <input className={input} value={x.name_bn} onChange={(e) => edit((d) => void (d.places_here![i].name_bn = e.target.value))} />
            <input className={input} value={x.what_bn} onChange={(e) => edit((d) => void (d.places_here![i].what_bn = e.target.value))} />
            <button type="button" onClick={() => edit((d) => void d.places_here!.splice(i, 1))} className="text-red-800" aria-label="মুছুন">
              ×
            </button>
          </div>
        ))}
        <AddButton label="জায়গা" onClick={() => edit((d) => void (d.places_here ??= []).push({ name_bn: "", what_bn: "" }))} />
      </Field>

      <Field label="যা নিয়ে নিশ্চিত নয়">
        <textarea
          className={input}
          rows={2}
          value={s.uncertain_bn ?? ""}
          onChange={(e) => edit((d) => void (d.uncertain_bn = e.target.value || undefined))}
        />
      </Field>

      <div className="sticky bottom-0 -mx-5 flex items-center gap-3 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
        </button>
        <button type="button" onClick={() => setJson(JSON.stringify(s, null, 2))} className="text-sm text-muted underline">
          JSON সরাসরি
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

/** An item's evidence level, or undefined (older stories have none). */
function evidenceOf(v: string | undefined): Evidence | undefined {
  return v && v in EVIDENCE_LABEL ? (v as Evidence) : undefined;
}

function Item({
  confidence,
  onConfidence,
  evidence,
  onEvidence,
  onDelete,
  children,
}: {
  confidence: Confidence;
  onConfidence: (c: Confidence) => void;
  evidence?: Evidence;
  onEvidence: (v: Evidence | undefined) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`mt-1.5 rounded-xl border p-2 ${confidence === "high" ? "border-line" : "border-amber-300 bg-amber-50/50"}`}>
      {children}
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <select value={confidence} onChange={(e) => onConfidence(e.target.value as Confidence)} className="rounded border border-line bg-card px-1">
          {(Object.keys(CONF_LABEL) as Confidence[]).map((c) => (
            <option key={c} value={c}>
              {CONF_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          value={evidence ?? ""}
          onChange={(e) => onEvidence((e.target.value || undefined) as Evidence | undefined)}
          className="rounded border border-line bg-card px-1"
          title="তথ্যটা কীসের ওপর দাঁড়িয়ে"
        >
          <option value="">ভিত্তি: —</option>
          {(Object.keys(EVIDENCE_LABEL) as Evidence[]).map((v) => (
            <option key={v} value={v}>
              {EVIDENCE_LABEL[v]}
            </option>
          ))}
        </select>
        {confidence !== "high" && <span className="text-amber-800">যাচাই করে &ldquo;নিশ্চিত&rdquo; করুন বা মুছুন</span>}
        <button type="button" onClick={onDelete} className="ms-auto text-red-800 underline">
          মুছুন
        </button>
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-1.5 text-xs font-semibold text-accent">
      + {label}
    </button>
  );
}
