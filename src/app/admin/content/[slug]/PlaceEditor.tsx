"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PlaceFiles } from "@/lib/content";
import { ERA_META } from "@/lib/format";
import { ERAS, TIERS, type StoryBlockT } from "@/lib/schema";
import { savePlace } from "../actions";
import { PhotoPicker } from "./PhotoPicker";

const KIND_LABEL: Record<StoryBlockT["kind"], string> = {
  event: "ঘটনা",
  fact: "তথ্য",
  person: "ব্যক্তি",
  stage: "নির্মাণের ধাপ",
  then_now: "তখন ও এখন",
};

const input = "w-full rounded-lg border border-line bg-card px-2.5 py-1.5 outline-none focus:border-accent";

export function PlaceEditor({ slug, initial }: { slug: string; initial: PlaceFiles }) {
  const router = useRouter();
  const [files, setFiles] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [saving, startSaving] = useTransition();

  /** Edit a copy of the files; the change is saved with the Save button. */
  const edit = (fn: (d: PlaceFiles) => void) => {
    setFiles((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
    setDirty(true);
    setMessage({});
  };

  const save = (next: PlaceFiles = files) =>
    startSaving(async () => {
      const r = await savePlace(slug, next);
      setMessage(r);
      if (!r.error) {
        setFiles(next);
        setDirty(false);
        router.refresh();
      }
    });

  const { meta, story, sources } = files;
  const unverified = story.filter((b) => b.evidence && !b.evidence.found).length;
  const sourceIds = sources.map((s) => s.id);

  const setStatus = (status: PlaceFiles["meta"]["status"]) => save({ ...files, meta: { ...meta, status } });

  return (
    <div className="grid gap-8 pb-24">
      {/* Status bar */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <h1 className="me-auto text-2xl font-bold">{meta.name.bn}</h1>
        <span className="rounded-full bg-card px-2.5 py-0.5 text-sm">status: {meta.status}</span>
        <button
          type="button"
          onClick={() => save()}
          disabled={saving || !dirty}
          className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-40"
        >
          {saving ? "সংরক্ষণ হচ্ছে…" : dirty ? "সংরক্ষণ করুন" : "সংরক্ষিত"}
        </button>
        {meta.status !== "review" && meta.status !== "published" && (
          <button type="button" onClick={() => setStatus("review")} disabled={saving} className="rounded-full border border-line px-3 py-1.5 text-sm">
            রিভিউতে পাঠান
          </button>
        )}
        {meta.status !== "published" ? (
          <button
            type="button"
            onClick={() => setStatus("published")}
            disabled={saving || unverified > 0}
            title={unverified ? "আগে সব ⚠ দাবি যাচাই করুন" : undefined}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            প্রকাশ করুন
          </button>
        ) : (
          <button type="button" onClick={() => setStatus("review")} disabled={saving} className="rounded-full border border-line px-3 py-1.5 text-sm">
            অপ্রকাশিত করুন
          </button>
        )}
        {message.error && <p className="w-full whitespace-pre-wrap text-sm text-red-800">{message.error}</p>}
        {message.ok && <p className="w-full text-sm text-emerald-800">{message.ok}</p>}
        {unverified > 0 && (
          <p className="w-full text-sm text-amber-800">
            ⚠ {unverified}টি দাবির উদ্ধৃতি উৎসে হুবহু পাওয়া যায়নি। প্রকাশের আগে সেগুলো উৎসের সাথে মিলিয়ে দেখুন।
          </p>
        )}
      </div>

      {/* Basics */}
      <Section title="মূল তথ্য">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="নাম (বাংলা)">
            <input className={input} value={meta.name.bn} onChange={(e) => edit((d) => void (d.meta.name.bn = e.target.value))} />
          </Field>
          <Field label="Name (English)">
            <input className={input} value={meta.name.en ?? ""} onChange={(e) => edit((d) => void (d.meta.name.en = e.target.value || undefined))} />
          </Field>
          <Field label="সারসংক্ষেপ (বাংলা)" wide>
            <textarea className={input} rows={3} value={meta.summary.bn} onChange={(e) => edit((d) => void (d.meta.summary.bn = e.target.value))} />
          </Field>
          <Field label="Summary (English)" wide>
            <textarea className={input} rows={2} value={meta.summary.en ?? ""} onChange={(e) => edit((d) => void (d.meta.summary.en = e.target.value || undefined))} />
          </Field>
          <Field label="যুগ">
            <select className={input} value={meta.era} onChange={(e) => edit((d) => void (d.meta.era = e.target.value as typeof meta.era))}>
              {ERAS.map((e) => (
                <option key={e} value={e}>
                  {ERA_META[e].bn} ({e})
                </option>
              ))}
            </select>
          </Field>
          <Field label="ধরন">
            <select className={input} value={meta.tier} onChange={(e) => edit((d) => void (d.meta.tier = e.target.value as typeof meta.tier))}>
              {TIERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="নির্মাণ শুরু (সাল)">
            <input type="number" className={input} value={meta.built.start} onChange={(e) => edit((d) => void (d.meta.built.start = Number(e.target.value)))} />
          </Field>
          <Field label="নির্মাণ শেষ (খালি = অজানা/অসমাপ্ত)">
            <input
              type="number"
              className={input}
              value={meta.built.end ?? ""}
              onChange={(e) => edit((d) => void (d.meta.built.end = e.target.value ? Number(e.target.value) : null))}
            />
          </Field>
          <Field label="নোট (যেমন: অসমাপ্ত)">
            <input
              className={input}
              value={meta.built.note?.bn ?? ""}
              onChange={(e) => edit((d) => void (d.meta.built.note = e.target.value ? { ...d.meta.built.note, bn: e.target.value } : undefined))}
            />
          </Field>
          <Field label="শহর">
            <input className={input} value={meta.city.bn} onChange={(e) => edit((d) => void (d.meta.city.bn = e.target.value))} />
          </Field>
        </div>
      </Section>

      {/* Key numbers */}
      <Section title="মূল সংখ্যা">
        <div className="grid gap-2">
          {(meta.keyNumbers ?? []).map((k, i) => (
            <div key={i} className="flex gap-2">
              <input className={`${input} w-28`} value={k.value.bn} onChange={(e) => edit((d) => void (d.meta.keyNumbers![i].value.bn = e.target.value))} />
              <input className={input} value={k.label.bn} onChange={(e) => edit((d) => void (d.meta.keyNumbers![i].label.bn = e.target.value))} />
              <IconButton label="মুছুন" onClick={() => edit((d) => void d.meta.keyNumbers!.splice(i, 1))}>
                ×
              </IconButton>
            </div>
          ))}
          {(meta.keyNumbers?.length ?? 0) < 4 && (
            <button
              type="button"
              className="justify-self-start text-sm text-accent"
              onClick={() => edit((d) => void (d.meta.keyNumbers = [...(d.meta.keyNumbers ?? []), { value: { bn: "" }, label: { bn: "" } }]))}
            >
              + সংখ্যা যোগ করুন
            </button>
          )}
        </div>
      </Section>

      {/* Photos */}
      <Section title="ছবি">
        <PhotoPicker
          slug={slug}
          files={files}
          onAdded={(next, ok) => {
            setFiles(next);
            setDirty(false);
            setMessage({ ok });
            router.refresh();
          }}
        />
      </Section>

      {/* Story */}
      <Section title={`গল্প (${story.length}টি অংশ)`}>
        <ol className="grid gap-3">
          {story.map((b, i) => (
            <li
              key={i}
              className={`rounded-xl border bg-card p-3 ${b.evidence && !b.evidence.found ? "border-amber-400" : "border-line"}`}
            >
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="rounded-full bg-paper px-2 py-0.5 font-semibold">{KIND_LABEL[b.kind]}</span>
                {(b.kind === "event" || b.kind === "stage") && (
                  <input
                    type="number"
                    placeholder="সাল"
                    className={`${input} w-24`}
                    value={b.year ?? ""}
                    onChange={(e) =>
                      edit((d) => {
                        const blk = d.story[i];
                        if (blk.kind === "event") blk.year = Number(e.target.value);
                        if (blk.kind === "stage") blk.year = e.target.value ? Number(e.target.value) : undefined;
                      })
                    }
                  />
                )}
                <span className="ms-auto flex gap-1">
                  <IconButton label="উপরে" disabled={i === 0} onClick={() => edit((d) => d.story.splice(i - 1, 0, ...d.story.splice(i, 1)))}>
                    ↑
                  </IconButton>
                  <IconButton label="নিচে" disabled={i === story.length - 1} onClick={() => edit((d) => d.story.splice(i + 1, 0, ...d.story.splice(i, 1)))}>
                    ↓
                  </IconButton>
                  <IconButton label="মুছুন" onClick={() => edit((d) => void d.story.splice(i, 1))}>
                    ×
                  </IconButton>
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={input} value={b.title.bn} onChange={(e) => edit((d) => void (d.story[i].title.bn = e.target.value))} />
                <input className={`${input} text-sm`} value={b.title.en ?? ""} onChange={(e) => edit((d) => void (d.story[i].title.en = e.target.value || undefined))} />
                <textarea
                  className={input}
                  rows={2}
                  value={b.body?.bn ?? ""}
                  onChange={(e) => edit((d) => void (d.story[i].body = { ...d.story[i].body, bn: e.target.value }))}
                />
                <textarea
                  className={`${input} text-sm`}
                  rows={2}
                  value={b.body?.en ?? ""}
                  onChange={(e) => edit((d) => void (d.story[i].body = { bn: d.story[i].body?.bn ?? "", en: e.target.value || undefined }))}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>সূত্র:</span>
                {sourceIds.map((id) => (
                  <label key={id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={b.sources.includes(id)}
                      onChange={(e) =>
                        edit((d) => {
                          const s = d.story[i].sources;
                          d.story[i].sources = e.target.checked ? [...s, id] : s.filter((x) => x !== id);
                        })
                      }
                    />
                    {id}
                  </label>
                ))}
              </div>
              {b.evidence && (
                <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${b.evidence.found ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
                  {b.evidence.found ? "✓ উৎসে পাওয়া গেছে: " : "⚠ উৎসে হুবহু পাওয়া যায়নি: "}
                  <q>{b.evidence.quote}</q>
                  {!b.evidence.found && (
                    <button
                      type="button"
                      className="ms-2 font-semibold underline"
                      onClick={() => edit((d) => void (d.story[i].evidence = { ...d.story[i].evidence!, found: true }))}
                    >
                      নিজে যাচাই করেছি
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex gap-3 text-sm">
          {(["event", "fact", "person"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="text-accent"
              onClick={() =>
                edit((d) =>
                  void d.story.push(
                    kind === "event"
                      ? { kind, year: meta.built.start, title: { bn: "" }, sources: sourceIds.slice(0, 1) }
                      : { kind, title: { bn: "" }, sources: sourceIds.slice(0, 1) },
                  ),
                )
              }
            >
              + {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="সূত্র">
        <ul className="text-sm">
          {sources.map((s) => (
            <li key={s.id}>
              <span className="text-muted">{s.id}:</span>{" "}
              <a href={s.url} target="_blank" rel="noreferrer" className="text-accent underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="size-7 rounded-full border border-line bg-paper leading-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
