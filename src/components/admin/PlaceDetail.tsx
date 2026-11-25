"use client";

import { useEffect, useState } from "react";
import type { AiStoryDataT } from "@/lib/ai/types";
import { CATEGORIES, categoryLabels, parseCategories, type CategoryId } from "@/lib/categories";
import { ago, parseLatLng } from "@/lib/format";
import { smallPicture } from "@/lib/pictures";
import { adminFetch } from "@/lib/supabase-browser";
import type { PlaceVideo } from "@/lib/video";
import { aiShareUrl } from "../AiPanel";
import { AiStory } from "../AiStory";
import { ImagePicker } from "./events/ImagePicker";
import { StoryEditor } from "./StoryEditor";
import { VideoManager } from "./VideoManager";

export type PlaceStatus = "ai" | "verified" | "hidden";

type Detail = {
  id: string;
  name_bn: string;
  name_en: string | null;
  lat: number;
  lng: number;
  kind: string | null;
  status: PlaceStatus;
  views: number;
  reports: number;
  likes: number;
  dislikes: number;
  created_at: string;
  updated_at: string;
  show_on_map?: boolean;
  story: AiStoryDataT;
  image: { src: string; credit: { author: string; license: string; sourceUrl: string; licenseUrl?: string } } | null;
  model: string | null;
  slug: string | null;
  verified_at: string | null;
  report_list: { id: number; message: string | null; created_at: string }[];
  videos: PlaceVideo[];
  /** The editor's categories, stored as "park,liberation" / "none" (null = guessed; undefined before the category migration). */
  category?: string | null;
  category_guess: CategoryId[];
};

type Tab = "story" | "media" | "reports";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/**
 * One place in the admin: what it is, the one decision (verify), its settings (map pin, category),
 * then its story, photo and video, and visitors' reports in tabs. Hiding sits apart at the bottom.
 */
export function PlaceDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("story");
  const [editing, setEditing] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);

  useEffect(() => {
    adminFetch(`/api/admin/stories/${id}`).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (r.ok) setDetail(data);
      else setError(data.error ?? `HTTP ${r.status}`);
    });
  }, [id]);

  async function call(label: string, path: string, init: RequestInit) {
    setBusy(label);
    setError(null);
    const r = await adminFetch(path, init);
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setError(data.error ?? `HTTP ${r.status}`);
    setDetail(data);
    setEditing(false);
    setConfirmRegen(false);
    setConfirmHide(false);
    onChanged();
  }
  const patch = (label: string, body: object) => call(label, `/api/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  const act = (action: string) => patch(action, { action });

  const back = (
    <button type="button" onClick={onClose} className="flex h-10 items-center gap-1 rounded-full pe-3 text-meta font-semibold text-accent md:hidden">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 6-6 6 6 6" />
      </svg>
      Places
    </button>
  );

  if (!detail) {
    return (
      <div className="p-6">
        {back}
        <p className="py-8 text-muted">{error ?? "Loading…"}</p>
      </div>
    );
  }

  const d = detail;
  const url = aiShareUrl({ name: d.name_bn, lat: d.lat, lng: d.lng, kind: d.kind ?? undefined, slug: d.slug ?? undefined });
  const thumb = smallPicture(d.image?.src) ?? smallPicture(d.videos?.[0]?.thumbnailUrl);
  const where = [d.name_en, d.story.locality_en, d.slug ? `/place/${d.slug}` : null].filter(Boolean).join(" · ");
  const btn = "h-10 rounded-full border border-line-strong bg-card px-4 text-meta font-semibold text-ink transition-colors hover:bg-hover disabled:opacity-50";
  const tabs: { id: Tab; label: string }[] = [
    { id: "story", label: "Story" },
    { id: "media", label: `Photo & video · ${(d.image ? 1 : 0) + (d.videos?.length ?? 0)}` },
    { id: "reports", label: `Reports · ${d.report_list.length}` },
  ];

  return (
    <div className="@container flex min-h-full flex-col gap-5 px-4 py-4 md:px-8 md:py-6">
      {back}

      {/* What it is */}
      <header className="flex flex-wrap items-start gap-4 md:gap-5">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- an outside picture (Commons / YouTube)
          <img src={thumb} alt="" className="aspect-[3/2] w-28 shrink-0 rounded-2xl bg-hover object-cover md:w-44" />
        ) : (
          <span className="grid aspect-[3/2] w-28 shrink-0 place-items-center rounded-2xl bg-hover text-micro text-muted md:w-44">No photo</span>
        )}
        <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <StatusChip status={d.status} />
            {d.show_on_map && d.status !== "hidden" && <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-semibold text-accent">On the map</span>}
          </div>
          <h2 className="text-display leading-tight font-bold">{d.name_bn}</h2>
          {where && <p className="text-meta break-words text-muted">{where}</p>}
        </div>
        <a href={url} target="_blank" rel="noreferrer" className={`${btn} flex shrink-0 items-center gap-1.5`}>
          View on site ↗
        </a>
      </header>

      {error && <p className="rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{error}</p>}

      {/* The one decision */}
      {d.status === "ai" && (
        <div className="flex flex-wrap items-center gap-4 rounded-[18px] bg-success-soft px-4 py-4 md:px-5">
          <ShieldIcon />
          <span className="flex min-w-0 flex-1 basis-56 flex-col">
            <span className="font-bold">Read it, then verify</span>
            <span className="text-meta text-ink-2">Verifying gives the place its own page and marks it ✓ যাচাইকৃত for visitors.</span>
          </span>
          <button type="button" disabled={!!busy} onClick={() => act("verify")} className="h-11 rounded-full bg-success px-6 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy === "verify" ? "…" : "Verify"}
          </button>
        </div>
      )}
      {d.status === "verified" && (
        <div className="flex flex-wrap items-center gap-4 rounded-[18px] bg-success-soft px-4 py-3.5 md:px-5">
          <ShieldIcon />
          <span className="flex-1 font-semibold text-success">✓ Verified{d.verified_at ? ` on ${date(d.verified_at)}` : ""}</span>
          <button type="button" disabled={!!busy} onClick={() => act("unverify")} className="text-meta font-semibold text-ink-2 underline hover:text-ink disabled:opacity-50">
            {busy === "unverify" ? "…" : "Unverify"}
          </button>
        </div>
      )}
      {d.status === "hidden" && (
        <div className="flex flex-wrap items-center gap-4 rounded-[18px] bg-hover px-4 py-3.5 md:px-5">
          <span className="flex-1 text-ink-2">
            <span className="font-semibold text-ink">Hidden from the site.</span> Visitors can&apos;t open it, and it has no pin.
          </span>
          <button type="button" disabled={!!busy} onClick={() => act("unhide")} className={btn}>
            {busy === "unhide" ? "…" : "Unhide"}
          </button>
        </div>
      )}

      {/* Settings */}
      <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5">
          <span className="flex flex-1 flex-col">
            <span className="font-semibold">Pin on the map</span>
            <span className="text-meta text-muted">{d.status === "hidden" ? "Not while hidden" : d.show_on_map ? "Visitors see it" : "Off the map"}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!!d.show_on_map}
            aria-label="Pin on the map"
            disabled={!!busy || d.status === "hidden"}
            onClick={() => act(d.show_on_map ? "hide_from_map" : "show_on_map")}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${d.show_on_map ? "bg-accent" : "bg-line-strong"}`}
          >
            <span className={`absolute top-[3px] size-[22px] rounded-full bg-white shadow-sm transition-all ${d.show_on_map ? "start-[23px]" : "start-[3px]"}`} />
          </button>
        </div>
<Categories
          stored={d.category}
          guess={d.category_guess ?? []}
          disabled={!!busy}
          onChange={(category) => patch("category", { category })}
        />
        <Location lat={d.lat} lng={d.lng} disabled={!!busy} onSave={(location) => patch("location", { location })} />
        <div className="flex flex-col gap-1 rounded-2xl border border-line px-4 py-3.5">
          <span className="font-semibold">What visitors think</span>
          <span className="text-meta text-ink-2">
            Opened {plural(d.views, "time")} · {plural(d.likes ?? 0, "like")} · {plural(d.dislikes ?? 0, "dislike")}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Place sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-11 shrink-0 border-b-2 px-4 whitespace-nowrap transition-colors ${tab === t.id ? "border-accent font-bold text-ink" : "border-transparent text-ink-2 hover:text-ink"} ${t.id === "reports" && d.report_list.length ? "text-danger" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "story" && (
        <div role="tabpanel" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => setEditing((e) => !e)} className={btn}>
              {editing ? "Close editor" : "Edit text"}
            </button>
            {!confirmRegen ? (
              <button type="button" disabled={!!busy} onClick={() => setConfirmRegen(true)} className={btn}>
                Rewrite with AI
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => call("regen", `/api/admin/stories/${id}/regenerate`, { method: "POST" })}
                  className="h-10 rounded-full bg-warning px-4 text-meta font-semibold text-white disabled:opacity-60"
                >
                  {busy === "regen" ? "AI is writing… (10–20 s)" : "Yes, replace the story"}
                </button>
                {busy !== "regen" && (
                  <button type="button" onClick={() => setConfirmRegen(false)} className="text-meta text-muted underline">
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
          {editing ? (
            <StoryEditor story={d.story} saving={busy === "save"} onSave={(story) => patch("save", { story })} />
          ) : (
            // The story as visitors read it, at the width of the site's panel.
            <div className="max-w-[560px] rounded-2xl border border-line bg-paper px-4 pb-4 md:px-5">
              <AiStory
                story={d.story}
                image={d.image ?? undefined}
                model={d.model ?? undefined}
                streaming={false}
                fallbackName={d.name_bn}
                at={{ lat: d.lat, lng: d.lng }}
                shareUrl={url}
                status={d.status}
                videos={d.videos}
              />
            </div>
          )}
        </div>
      )}

      {tab === "media" && (
        <div role="tabpanel" className="flex max-w-2xl flex-col gap-4">
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold">Photo</p>
            <p className="mt-0.5 text-meta text-muted">Search Wikimedia Commons or browse photos taken nearby. Only pictures with a usable licence can be picked.</p>
            <div className="mt-3">
              <ImagePicker value={d.image} near={{ lat: d.lat, lng: d.lng }} onChange={(image) => patch("image", { image })} />
            </div>
            {busy === "image" && <p className="mt-1 text-meta text-muted">Saving…</p>}
          </div>
          <VideoManager storyId={id} videos={d.videos ?? []} onChange={(videos) => setDetail({ ...d, videos })} />
        </div>
      )}

      {tab === "reports" && (
        <div role="tabpanel" className="flex max-w-2xl flex-col gap-3">
          {d.report_list.length === 0 ? (
            <p className="py-4 text-muted">No reports. Visitors use &ldquo;ভুল জানান&rdquo; under a story to send one.</p>
          ) : (
            <>
              <ul className="flex flex-col">
                {d.report_list.map((r) => (
                  <li key={r.id} className="flex flex-col gap-0.5 border-b border-line py-3">
                    <span className="text-ink">{r.message ? `“${r.message}”` : "(no message)"}</span>
                    <span className="text-meta text-muted">{ago(r.created_at)}</span>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={!!busy} onClick={() => act("clear_reports")} className={`${btn} self-start`}>
                {busy === "clear_reports" ? "…" : "Fixed: clear the reports"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Apart, at the bottom */}
      <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <span className="flex-1 text-meta text-muted">
          Written by AI on {date(d.created_at)} · last changed {ago(d.updated_at).toLowerCase()}
        </span>
        {d.status !== "hidden" &&
          (!confirmHide ? (
            <button type="button" disabled={!!busy} onClick={() => setConfirmHide(true)} className="h-10 rounded-full border border-[#f0c9c4] bg-card px-4 text-meta font-semibold text-danger hover:bg-[#fdecea] disabled:opacity-50">
              Hide from the site
            </button>
          ) : (
            <span className="flex items-center gap-3">
              <button type="button" disabled={!!busy} onClick={() => act("hide")} className="h-10 rounded-full bg-danger px-4 text-meta font-semibold text-white disabled:opacity-50">
                {busy === "hide" ? "…" : "Yes, hide it"}
              </button>
              <button type="button" onClick={() => setConfirmHide(false)} className="text-meta text-muted underline">
                Cancel
              </button>
            </span>
          ))}
      </footer>
    </div>
  );
}

export function StatusChip({ status }: { status: PlaceStatus }) {
  const s = {
    ai: ["bg-warning-soft text-warning", "AI only · not checked"],
    verified: ["bg-success-soft text-success", "✓ Verified"],
    hidden: ["bg-hover text-muted", "Hidden"],
  }[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-micro font-semibold ${s[0]}`}>{s[1]}</span>;
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/**
 * Which map chips the place appears under: several can be ticked (a park that is also a 1971 site).
 * Untouched, it follows the guess from the story's kind and era; ticking a box makes it the editor's
 * choice, and "Back to automatic" returns to the guess.
 */
function Categories({ stored, guess, disabled, onChange }: { stored: string | null | undefined; guess: CategoryId[]; disabled: boolean; onChange: (c: CategoryId[] | null) => void }) {
  const chosen = parseCategories(stored);
  const on = chosen ?? guess;
  const missing = stored === undefined;
  const toggle = (id: CategoryId) => onChange(on.includes(id) ? on.filter((c) => c !== id) : [...on, id]);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line px-4 py-3.5 @md:col-span-2 @3xl:col-span-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-semibold">Categories</span>
        <span className="text-meta text-muted">
          {missing
            ? "Run the story_category migration first"
            : chosen
              ? `Chosen by you · ${categoryLabels(chosen) ?? "none"}`
              : `Automatic · ${categoryLabels(guess) ?? "none"}`}
        </span>
        {chosen && !missing && (
          <button type="button" disabled={disabled} onClick={() => onChange(null)} className="ms-auto text-meta font-semibold text-accent hover:underline disabled:opacity-50">
            Back to automatic
          </button>
        )}
      </div>
      <div role="group" aria-label="Categories" className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const ticked = on.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={ticked}
              disabled={disabled || missing}
              title={c.en}
              onClick={() => toggle(c.id)}
              className={`h-8 rounded-full border px-3 text-meta transition-colors disabled:opacity-50 ${
                ticked ? (chosen ? "border-accent bg-accent text-on-accent" : "border-accent bg-accent-soft text-accent") : "border-line text-ink-2 hover:bg-hover"
              }`}
            >
              {ticked ? "✓ " : ""}
              {c.bn}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Where the pin is, a link to check it on Google Maps, and a way to move it: paste the right
 * coordinates (Google Maps: right-click the spot, click the numbers to copy them).
 */
function Location({ lat, lng, disabled, onSave }: { lat: number; lng: number; disabled: boolean; onSave: (l: { lat: number; lng: number }) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const parsed = parseLatLng(text);
  const here = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line px-4 py-3.5 @md:col-span-2 @3xl:col-span-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold">Pin location</span>
        <span className="text-meta text-muted tabular-nums">{here}</span>
        <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="text-meta font-semibold text-accent hover:underline">
          Check on Google Maps ↗
        </a>
        {!editing && (
          <button type="button" disabled={disabled} onClick={() => setEditing(true)} className="ms-auto text-meta font-semibold text-accent hover:underline disabled:opacity-50">
            Move pin
          </button>
        )}
      </div>
      {editing && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!parsed) return;
            onSave(parsed);
            setEditing(false);
            setText("");
          }}
        >
          <input
            id="pin-location"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste coordinates, e.g. 23.7104, 90.4074"
            aria-label="New coordinates"
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-meta outline-none focus:border-accent"
          />
          <button type="submit" disabled={!parsed || disabled} className="h-9 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-full px-3 text-meta font-semibold text-ink-2 hover:bg-hover">
            Cancel
          </button>
          <span className="basis-full text-micro text-muted">In Google Maps, right-click the right spot and click the numbers at the top to copy them.</span>
        </form>
      )}
    </div>
  );
}
