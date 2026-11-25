"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/supabase-browser";
import { AdminApp } from "./AdminApp";

/** /admin/collections behind the usual login. */
export function CollectionsAdmin() {
  return <AdminApp>{() => <Collections />}</AdminApp>;
}

/**
 * One place in the editor. A place "Draft with AI" suggested that the site doesn't have yet has no
 * story_id until its story is written (`pending` holds what writing it needs).
 */
type Place = {
  key: string;
  story_id: string | null;
  name: string;
  meta: string;
  note_bn: string;
  pending?: { name_bn: string; lat: number; lng: number; kind: string };
  state?: "waiting" | "writing" | "failed";
  error?: string;
};
type DraftPlace = { name_bn: string; name_en: string; note_bn: string; lat: number; lng: number; kind: string; approximate: boolean; story_id: string | null; label?: string };
type AiDraft = { title_en: string; intro_bn: string; places: DraftPlace[]; dropped: { name: string; reason: string }[] };
type Draft = {
  id: string | null;
  slug: string;
  title_bn: string;
  title_en: string;
  intro_bn: string;
  status: "draft" | "published";
  sort_order: number;
  places: Place[];
};
type Saved = Omit<Draft, "places" | "title_en" | "intro_bn"> & {
  id: string;
  title_en: string | null;
  intro_bn: string | null;
  places: { story_id: string; label: string; line?: string; note_bn?: string }[];
};
type Story = { id: string; name_bn: string; name_en: string | null; status: string; category_label: string | null };

const EMPTY: Draft = { id: null, slug: "", title_bn: "", title_en: "", intro_bn: "", status: "draft", sort_order: 0, places: [] };

/** An address from an English title: "UNESCO Heritage" → "unesco-heritage". */
const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const toDraft = (c: Saved): Draft => ({
  id: c.id,
  slug: c.slug,
  title_bn: c.title_bn,
  title_en: c.title_en ?? "",
  intro_bn: c.intro_bn ?? "",
  status: c.status,
  sort_order: c.sort_order,
  places: c.places.map((p) => ({ key: p.story_id, story_id: p.story_id, name: p.label, meta: p.line ?? "", note_bn: p.note_bn ?? "" })),
});

const btn = "h-10 rounded-full border border-line px-4 text-meta font-semibold transition-colors hover:bg-hover disabled:opacity-50";
const field = "w-full rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent";

/**
 * Collections: a list beside one collection's editor (phones: one at a time). A collection is a
 * title, a short intro and places in order; published ones show on the map (সংগ্রহ) and at
 * /collection/<address>.
 */
function Collections() {
  const [list, setList] = useState<Saved[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "Draft with AI": researching, or writing new places' stories; and what it couldn't place. */
  const [ai, setAi] = useState<"research" | "writing" | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const load = useCallback(async (select?: string) => {
    const r = await adminFetch("/api/admin/collections");
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error ?? `HTTP ${r.status}`);
    setList(d.collections);
    setMissing(!!d.missing);
    if (select) {
      const c = (d.collections as Saved[]).find((x) => x.id === select);
      if (c) setDraft(toDraft(c));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    load();
    adminFetch("/api/admin/stories")
      .then((r) => r.json())
      .then((d) => setStories(d.stories ?? []))
      .catch(() => {});
  }, [load]);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };
  const open = (d: Draft | null) => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    setDraft(d);
    setDirty(false);
    setError(null);
  };

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = {
      slug: draft.slug,
      title_bn: draft.title_bn,
      title_en: draft.title_en || null,
      intro_bn: draft.intro_bn || null,
      status: draft.status,
      sort_order: draft.sort_order,
      // Places still waiting for their story (or whose story failed) aren't saved yet.
      places: draft.places.flatMap((p) => (p.story_id ? [{ story_id: p.story_id, note_bn: p.note_bn || null }] : [])),
    };
    const r = await adminFetch(draft.id ? `/api/admin/collections/${draft.id}` : "/api/admin/collections", {
      method: draft.id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error ?? `HTTP ${r.status}`);
    setDirty(false);
    await load(d.id);
  }

  /** Updates one place in the open collection (by key), wherever the list has moved meanwhile. */
  const setPlace = (key: string, patch: Partial<Place>) =>
    setDraft((d) => (d ? { ...d, places: d.places.map((p) => (p.key === key ? { ...p, ...patch } : p)) } : d));

  /** Writes and saves the story of one suggested place the site doesn't have yet, and pins it. */
  async function writePlace(p: Place) {
    if (!p.pending) return;
    setPlace(p.key, { state: "writing", error: undefined });
    const r = await adminFetch("/api/admin/collections/place", { method: "POST", body: JSON.stringify(p.pending) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !d.story_id) return setPlace(p.key, { state: "failed", error: d.error ?? "Could not write this story" });
    setPlace(p.key, { story_id: d.story_id, name: d.label ?? p.name, state: undefined, pending: undefined });
    setDirty(true);
  }

  /** "Draft with AI": title → intro, English title and places; new places' stories are then written one by one. */
  async function draftWithAi() {
    if (!draft || !draft.title_bn.trim()) return;
    setAi("research");
    setAiNote(null);
    setError(null);
    const r = await adminFetch("/api/admin/collections/draft", { method: "POST", body: JSON.stringify({ title_bn: draft.title_bn, title_en: draft.title_en }) }).catch(() => null);
    const res = (r ? await r.json().catch(() => ({})) : {}) as AiDraft & { error?: string };
    if (!r?.ok) {
      setAi(null);
      return setError(res.error ?? "The AI could not draft this collection. Try again.");
    }
    const have = new Set(draft.places.map((p) => p.story_id).filter(Boolean));
    const added: Place[] = res.places
      .filter((p) => !p.story_id || !have.has(p.story_id))
      .map((p, i) =>
        p.story_id
          ? { key: p.story_id, story_id: p.story_id, name: p.label ?? p.name_bn, meta: p.name_en, note_bn: p.note_bn }
          : {
              key: `new:${Date.now()}:${i}`,
              story_id: null,
              name: p.name_bn,
              meta: [p.name_en, "new place", p.approximate ? "approximate location, check the pin" : ""].filter(Boolean).join(" · "),
              note_bn: p.note_bn,
              pending: { name_bn: p.name_bn, lat: p.lat, lng: p.lng, kind: p.kind },
              state: "waiting" as const,
            },
      );
    const title_en = draft.title_en || res.title_en;
    edit({
      title_en,
      ...(draft.slug ? {} : { slug: slugify(title_en) }),
      intro_bn: draft.intro_bn || res.intro_bn,
      places: [...draft.places, ...added],
    });
    const fresh = added.filter((p) => p.pending).length;
    setAiNote(
      [
        `AI suggested ${res.places.length} places: ${res.places.length - fresh} already on the site${fresh ? `, ${fresh} new (writing their stories now, about half a minute each)` : ""}.`,
        res.dropped.length ? `Left out (not found on the map): ${res.dropped.map((d) => d.name).join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
    // New places, one at a time (each is a full story written by Gemini).
    setAi("writing");
    for (const p of added) if (p.pending) await writePlace(p);
    setAi(null);
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`Delete "${draft.title_bn}"? The places themselves stay.`)) return;
    setBusy(true);
    const r = await adminFetch(`/api/admin/collections/${draft.id}`, { method: "DELETE" });
    setBusy(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
    setDraft(null);
    setDirty(false);
    await load();
  }

  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:flex-row">
      {/* The list (phones: hidden while one is open) */}
      <aside className={`flex flex-col border-line md:w-80 md:shrink-0 md:border-e ${draft ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center justify-between gap-3 px-5 pt-6 pb-4">
          <h1 className="text-2xl font-bold">Collections</h1>
          <button type="button" disabled={missing} onClick={() => open({ ...EMPTY })} className="h-10 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
            + New
          </button>
        </div>
        {missing && (
          <p className="mx-5 mb-4 rounded-xl bg-warning-soft px-3 py-2.5 text-meta text-ink-2">
            Run the <code>collections</code> migration in Supabase first (supabase/migrations/20261128000000_collections.sql).
          </p>
        )}
        <ul className="flex-1 overflow-y-auto px-3 pb-24">
          {list?.length === 0 && !missing && <li className="px-2 py-6 text-meta text-muted">No collections yet. Start one with “+ New”, e.g. “UNESCO ঐতিহ্য” or “১৯৭১-এর ঢাকা”.</li>}
          {list?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(toDraft(c))}
                className={`flex w-full flex-col gap-0.5 rounded-2xl px-3 py-3 text-start transition-colors hover:bg-hover ${draft?.id === c.id ? "bg-accent-soft" : ""}`}
              >
                <span className="font-semibold">{c.title_bn}</span>
                <span className="text-meta text-muted">
                  {c.places.length} {c.places.length === 1 ? "place" : "places"} ·{" "}
                  <span className={c.status === "published" ? "text-success" : "text-warning"}>{c.status === "published" ? "Published" : "Draft"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* One collection */}
      <main className={`min-w-0 flex-1 overflow-y-auto ${draft ? "block" : "hidden md:block"}`}>
        {!draft ? (
          <div className="grid h-full place-items-center p-8 text-center text-muted">
            <p>
              Pick a collection, or make a new one.
              <br />
              A collection is a title, a short intro and places in order.
            </p>
          </div>
        ) : (
          <Editor
            draft={draft}
            dirty={dirty}
            busy={busy}
            error={error}
            stories={stories}
            onEdit={edit}
            onSave={save}
            onDelete={remove}
            ai={ai}
            aiNote={aiNote}
            onDraftAi={draftWithAi}
            onRetry={writePlace}
            onBack={() => open(null)}
          />
        )}
      </main>
    </div>
  );
}

function Editor({
  draft,
  dirty,
  busy,
  error,
  stories,
  onEdit,
  onSave,
  onDelete,
  onBack,
  ai,
  aiNote,
  onDraftAi,
  onRetry,
}: {
  draft: Draft;
  dirty: boolean;
  busy: boolean;
  error: string | null;
  stories: Story[];
  onEdit: (p: Partial<Draft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onBack: () => void;
  ai: "research" | "writing" | null;
  aiNote: string | null;
  onDraftAi: () => void;
  onRetry: (p: Place) => void;
}) {
  const [slugTouched, setSlugTouched] = useState(!!draft.id);
  const [q, setQ] = useState("");
  const inList = useMemo(() => new Set(draft.places.map((p) => p.story_id)), [draft.places]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return stories
      .filter((st) => st.status !== "hidden" && !inList.has(st.id) && (st.name_bn.toLowerCase().includes(s) || (st.name_en ?? "").toLowerCase().includes(s)))
      .slice(0, 8);
  }, [q, stories, inList]);

  const move = (i: number, by: number) => {
    const next = [...draft.places];
    const [p] = next.splice(i, 1);
    next.splice(i + by, 0, p);
    onEdit({ places: next });
  };
  const add = (st: Story) => {
    onEdit({ places: [...draft.places, { key: st.id, story_id: st.id, name: st.name_bn, meta: [st.name_en, st.category_label].filter(Boolean).join(" · "), note_bn: "" }] });
    setQ("");
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 pt-5 pb-28 md:px-10 md:py-8">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="h-10 rounded-full pe-3 text-meta font-semibold text-accent md:hidden">
          ‹ Collections
        </button>
        <span className={`rounded-full px-2.5 py-0.5 text-meta font-semibold ${draft.status === "published" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
          {draft.status === "published" ? "Published" : "Draft"}
        </span>
        {draft.id && draft.status === "published" && !dirty && (
          <span className="ms-auto flex gap-2">
            <a href={`/?collection=${draft.slug}`} target="_blank" rel="noreferrer" className={btn}>
              On the map ↗
            </a>
            <a href={`/collection/${draft.slug}`} target="_blank" rel="noreferrer" className={btn}>
              Page ↗
            </a>
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Title (Bangla)</span>
          <input lang="bn" value={draft.title_bn} onChange={(e) => onEdit({ title_bn: e.target.value })} placeholder="UNESCO ঐতিহ্য" className={field} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-semibold">Title (English)</span>
          <input
            value={draft.title_en}
            onChange={(e) => onEdit({ title_en: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
            placeholder="UNESCO heritage"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="font-semibold">
            Address <span className="font-normal text-muted">placeandpast.com/collection/…</span>
          </span>
          <input
            value={draft.slug}
            onChange={(e) => {
              setSlugTouched(true);
              onEdit({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
            }}
            placeholder="unesco-heritage"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="font-semibold">Intro (Bangla)</span>
          <textarea lang="bn" rows={3} value={draft.intro_bn} onChange={(e) => onEdit({ intro_bn: e.target.value })} placeholder="দু-এক বাক্যে: এই সংগ্রহে কী আছে, কেন দেখবেন।" className={field} />
        </label>
      </div>

      {/* Draft with AI: from the title, an intro and places (new places get their stories and pins). */}
      <div className="flex flex-col gap-2 rounded-2xl border border-accent/40 bg-accent-soft/60 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">✦ Draft with AI</span>
            <span className="text-meta text-ink-2">
              {ai === "research"
                ? "Researching places for this title… (up to a minute)"
                : ai === "writing"
                  ? "Writing the new places' stories, one by one…"
                  : "From the title: an intro and 5–10 places in order. New places get their story and a map pin. You review before publishing."}
            </span>
          </span>
          <button
            type="button"
            disabled={!!ai || busy || !draft.title_bn.trim()}
            onClick={onDraftAi}
            title={draft.title_bn.trim() ? undefined : "Write the Bangla title first"}
            className="h-10 shrink-0 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {ai ? "Working…" : draft.places.length ? "Suggest more places" : "Draft with AI"}
          </button>
        </div>
        {aiNote && <p className="text-meta text-ink-2">{aiNote}</p>}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lead font-bold">
          Places <span className="font-normal text-muted">({draft.places.length})</span>
        </h2>
        <ol className="flex flex-col gap-2">
          {draft.places.map((p, i) => (
            <li key={p.key} className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${p.state === "failed" ? "border-danger/50" : p.pending ? "border-dashed border-accent/50" : "border-line"}`}>
              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-meta font-bold text-on-accent">{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="font-semibold">
                  {p.name} {p.meta && <span className="font-normal text-meta text-muted">· {p.meta}</span>}
                </span>
                {p.state && (
                  <span className={`flex items-center gap-2 text-meta ${p.state === "failed" ? "text-danger" : "text-accent"}`}>
                    {p.state === "writing" ? "Writing its story…" : p.state === "waiting" ? "Waiting for its turn…" : (p.error ?? "Could not write this story")}
                    {p.state === "failed" && !ai && (
                      <button type="button" onClick={() => onRetry(p)} className="font-semibold underline">
                        Try again
                      </button>
                    )}
                  </span>
                )}
                <input
                  lang="bn"
                  value={p.note_bn}
                  onChange={(e) => onEdit({ places: draft.places.map((x, j) => (j === i ? { ...x, note_bn: e.target.value } : x)) })}
                  placeholder="Optional: one line about why it's here (Bangla)"
                  className="w-full rounded-lg border border-transparent bg-paper px-2 py-1 text-meta outline-none focus:border-accent"
                />
              </div>
              <span className="flex shrink-0 gap-1">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-full hover:bg-hover disabled:opacity-30">
                  ↑
                </button>
                <button type="button" aria-label="Move down" disabled={i === draft.places.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-full hover:bg-hover disabled:opacity-30">
                  ↓
                </button>
                <button type="button" aria-label="Remove" onClick={() => onEdit({ places: draft.places.filter((_, j) => j !== i) })} className="grid size-9 place-items-center rounded-full text-danger hover:bg-hover">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a place: type its name (Bangla or English)…" className={field} />
          {matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-line bg-card shadow-menu">
              {matches.map((st) => (
                <li key={st.id}>
                  <button type="button" onClick={() => add(st)} className="flex w-full flex-col px-4 py-2.5 text-start hover:bg-hover">
                    <span className="font-semibold">{st.name_bn}</span>
                    <span className="text-meta text-muted">{[st.name_en, st.category_label, st.status === "verified" ? "✓ verified" : "AI"].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && matches.length === 0 && <p className="mt-1.5 text-meta text-muted">No saved place matches. A place must be opened on the map once (so its story is saved) before it can be added.</p>}
        </div>
      </section>

      <label className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5">
        <span className="flex flex-1 flex-col">
          <span className="font-semibold">Published</span>
          <span className="text-meta text-muted">{draft.status === "published" ? "Visitors see it on the map and its page" : "Only you see it"}</span>
        </span>
        <input type="checkbox" checked={draft.status === "published"} onChange={(e) => onEdit({ status: e.target.checked ? "published" : "draft" })} className="size-5 accent-[var(--accent)]" />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2.5 text-meta text-danger">
          {error}
        </p>
      )}

      <div className="sticky bottom-[calc(var(--admin-tabbar)+0.75rem)] flex items-center gap-3 rounded-2xl bg-card/95 p-2 shadow-float backdrop-blur md:bottom-4">
        <button type="button" disabled={busy || !dirty || !!ai} onClick={onSave} className="h-11 flex-1 rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {busy ? "Saving…" : ai ? "Wait for the AI…" : dirty ? "Save" : "Saved"}
        </button>
        {draft.id && (
          <button type="button" disabled={busy} onClick={onDelete} className={`${btn} text-danger`}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
