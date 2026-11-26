"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/supabase-browser";

/*
 * Adding places to the map from the admin (visitors no longer create them by clicking the map):
 *  - Find a place: search OpenStreetMap, check the spot, and the AI writes its story; it is pinned.
 *  - Suggest with AI: an area's meaningful historical places; tick the ones to add. Saved places
 *    not yet on the map are just pinned; new ones get their story written first.
 */

type Geo = { name: string; context: string; lat: number; lng: number; kind: string };
type Suggestion = {
  name_bn: string;
  name_en: string;
  note_bn: string;
  lat: number;
  lng: number;
  kind: string;
  approximate: boolean;
  story_id: string | null;
  label?: string;
  pinned?: boolean;
};
type RowState = "waiting" | "working" | "done" | "failed";

const field = "h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 outline-none focus:border-accent";
const primary = "h-11 shrink-0 rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50";
/** Not places worth a story: bus stops, stations, roads and paths (they crowd the search results). */
const NOT_A_PLACE = /^(highway=|public_transport=|railway=(?!station)|amenity=(bus_station|parking|fuel)|route=)/;

const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/** Writes and saves a new place's story, pinned; returns its id. */
async function createPlace(p: { name_bn: string; lat: number; lng: number; kind: string }): Promise<string> {
  const r = await adminFetch("/api/admin/collections/place", { method: "POST", body: JSON.stringify(p) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if (!r?.ok || !d.story_id) throw new Error(d.error ?? "Could not write this place's story");
  return d.story_id as string;
}

async function pinPlace(id: string): Promise<void> {
  const r = await adminFetch(`/api/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify({ action: "show_on_map" }) }).catch(() => null);
  if (!r?.ok) throw new Error((r && (await r.json().catch(() => ({}))).error) || "Could not pin it");
}

export function AddPlaces({ onClose, onAdded }: { onClose: () => void; onAdded: (id?: string) => void }) {
  const [tab, setTab] = useState<"find" | "suggest">("find");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Add places">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-paper shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-5 pt-4 pb-3">
          <h2 className="flex-1 text-lead font-bold">Add places to the map</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink">
            ✕
          </button>
        </div>
        <div className="flex gap-1 px-5 pt-3" role="tablist">
          {(
            [
              ["find", "Find a place"],
              ["suggest", "✦ Suggest with AI"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`h-9 rounded-full px-4 text-meta font-semibold ${tab === id ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-hover"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto px-5 pt-4 pb-5">{tab === "find" ? <FindPlace onAdded={onAdded} /> : <SuggestPlaces onAdded={onAdded} />}</div>
      </div>
    </div>
  );
}

function FindPlace({ onAdded }: { onAdded: (id?: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Geo[] | null>(null);
  const [busy, setBusy] = useState<"search" | "write" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<Geo | null>(null);
  const [name, setName] = useState("");

  async function search() {
    if (q.trim().length < 2) return;
    setBusy("search");
    setError(null);
    setPick(null);
    const r = await adminFetch(`/api/admin/geocode?q=${encodeURIComponent(q.trim())}`).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setError(d.error ?? "The place search is not responding");
    setResults(((d.results ?? []) as Geo[]).filter((g) => !NOT_A_PLACE.test(g.kind)));
  }

  async function write() {
    if (!pick || !name.trim()) return;
    setBusy("write");
    setError(null);
    try {
      const id = await createPlace({ name_bn: name.trim(), lat: pick.lat, lng: pick.lng, kind: pick.kind });
      onAdded(id);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input id="add-place-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Dhaka Medical College, লালবাগ কেল্লা" aria-label="Place name" className={field} />
        <button type="submit" disabled={busy !== null || q.trim().length < 2} className={primary}>
          {busy === "search" ? "…" : "Search"}
        </button>
      </form>
      {results && !pick && (
        <ul className="flex flex-col gap-1">
          {results.length === 0 && <li className="text-meta text-muted">Nothing found. Try the English name, or another spelling.</li>}
          {results.map((r) => (
            <li key={`${r.name}${r.lat}${r.lng}`}>
              <button
                type="button"
                onClick={() => {
                  setPick(r);
                  // The name only, not the address some results carry after a comma.
                  setName(r.name.split(",")[0].trim());
                }}
                className="flex w-full flex-col rounded-xl px-3 py-2 text-start hover:bg-hover"
              >
                <span className="font-semibold">{r.name}</span>
                <span className="text-meta text-muted">{[r.context, r.kind].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pick && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
          <p className="text-meta text-ink-2">
            {pick.context} · {pick.lat.toFixed(5)}, {pick.lng.toFixed(5)} ·{" "}
            <a href={mapsLink(pick.lat, pick.lng)} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
              Check on Google Maps ↗
            </a>
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Name (Bangla if you can)</span>
            <input id="add-place-name" lang="bn" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={write} disabled={busy !== null || !name.trim()} className={primary}>
              {busy === "write" ? "Writing its story… (about half a minute)" : "Write story & pin"}
            </button>
            <button type="button" onClick={() => setPick(null)} disabled={busy !== null} className="text-meta font-semibold text-accent hover:underline">
              Pick another
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  );
}

function SuggestPlaces({ onAdded }: { onAdded: (id?: string) => void }) {
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState<"suggest" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [state, setState] = useState<Record<number, { s: RowState; error?: string }>>({});

  async function suggest() {
    if (area.trim().length < 2) return;
    setBusy("suggest");
    setError(null);
    setList(null);
    setState({});
    const r = await adminFetch("/api/admin/places/suggest", { method: "POST", body: JSON.stringify({ area: area.trim() }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setError(d.error ?? "The AI could not suggest places. Try again.");
    const places = (d.places ?? []) as Suggestion[];
    setList(places);
    setDropped(((d.dropped ?? []) as { name: string }[]).map((x) => x.name));
    setChosen(new Set(places.flatMap((p, i) => (p.pinned ? [] : [i]))));
  }

  async function add() {
    if (!list) return;
    setBusy("add");
    const todo = [...chosen].sort((a, b) => a - b);
    setState(Object.fromEntries(todo.map((i) => [i, { s: "waiting" as RowState }])));
    // One at a time: a new place is a whole story written by the AI.
    for (const i of todo) {
      const p = list[i];
      setState((s) => ({ ...s, [i]: { s: "working" } }));
      try {
        if (p.story_id) await pinPlace(p.story_id);
        else await createPlace({ name_bn: p.name_bn, lat: p.lat, lng: p.lng, kind: p.kind });
        setState((s) => ({ ...s, [i]: { s: "done" } }));
      } catch (e) {
        setState((s) => ({ ...s, [i]: { s: "failed", error: (e as Error).message } }));
      }
    }
    setBusy(null);
    onAdded();
  }

  const toggle = (i: number) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          suggest();
        }}
      >
        <input id="add-place-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="An area, e.g. Lalbagh, Old Dhaka, Chattogram, Bogura" aria-label="Area" className={field} />
        <button type="submit" disabled={busy !== null || area.trim().length < 2} className={primary}>
          {busy === "suggest" ? "Looking… (up to a minute)" : "Suggest"}
        </button>
      </form>
      {list && (
        <>
          {list.length === 0 && <p className="text-meta text-muted">No places found for this area. Try a nearby town or a different spelling.</p>}
          <ul className="flex flex-col gap-1.5">
            {list.map((p, i) => {
              const st = state[i];
              return (
                <li key={`${p.name_bn}${i}`}>
                  <label className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${p.pinned ? "border-line opacity-60" : "border-line"}`}>
                    <input type="checkbox" checked={chosen.has(i)} disabled={!!p.pinned || busy !== null} onChange={() => toggle(i)} className="mt-1 size-5 accent-[var(--accent)]" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-semibold">
                        {p.label ?? p.name_bn} <span className="font-normal text-meta text-muted">· {p.name_en}</span>
                      </span>
                      {p.note_bn && <span className="text-meta text-ink-2">{p.note_bn}</span>}
                      <span className="text-micro text-muted">
                        {p.pinned ? "Already on the map" : p.story_id ? "Saved, not on the map: will be pinned" : "New: the AI writes its story, then it's pinned"}
                        {p.approximate && " · approximate location, check the pin"} ·{" "}
                        <a href={mapsLink(p.lat, p.lng)} target="_blank" rel="noreferrer" className="underline hover:text-accent">
                          map ↗
                        </a>
                      </span>
                      {st && (
                        <span className={`text-meta font-semibold ${st.s === "failed" ? "text-danger" : st.s === "done" ? "text-success" : "text-accent"}`}>
                          {st.s === "waiting" ? "Waiting…" : st.s === "working" ? (p.story_id ? "Pinning…" : "Writing its story…") : st.s === "done" ? "✓ Added" : st.error}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {dropped.length > 0 && <p className="text-meta text-muted">Left out (not found on the map): {dropped.join(", ")}.</p>}
          {list.length > 0 && (
            <button type="button" onClick={add} disabled={busy !== null || chosen.size === 0} className={`${primary} self-start`}>
              {busy === "add" ? "Adding… (new places take about half a minute each)" : `Add ${chosen.size} ${chosen.size === 1 ? "place" : "places"}`}
            </button>
          )}
        </>
      )}
      {error && <p className="text-meta text-danger">{error}</p>}
    </div>
  );
}
