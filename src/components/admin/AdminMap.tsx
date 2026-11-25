"use client";

import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiStoryDataT } from "@/lib/ai/types";
import { loadStyle, MIN_ZOOM, lockFlat } from "@/lib/map-style";
import { adminFetch, browserSupabase } from "@/lib/supabase-browser";
import { aiShareUrl } from "../AiPanel";
import { AiStory } from "../AiStory";
import { SidePanel } from "../SidePanel";
import { ImagePicker } from "./events/ImagePicker";
import { StoryEditor } from "./StoryEditor";
import { VideoManager } from "./VideoManager";
import type { PlaceVideo } from "@/lib/video";
import { THEME } from "@/lib/theme";
import { CATEGORIES, categoryLabel, NO_CATEGORY, type CategoryId } from "@/lib/categories";

type Status = "ai" | "verified" | "hidden";

type Row = {
  id: string;
  name_bn: string;
  name_en: string | null;
  lat: number;
  lng: number;
  kind: string | null;
  status: Status;
  views: number;
  reports: number;
  /** Visitors' 👍 and 👎 (the public sees only the likes). */
  likes: number;
  dislikes: number;
  updated_at: string;
  /** Has a pin on the public map (undefined before the show_on_map migration). */
  show_on_map?: boolean;
};

type Detail = Row & {
  story: AiStoryDataT;
  image: { src: string; credit: { author: string; license: string; sourceUrl: string; licenseUrl?: string } } | null;
  model: string | null;
  slug: string | null;
  verified_at: string | null;
  report_list: { id: number; message: string | null; created_at: string }[];
  videos: PlaceVideo[];
  /** The editor's category for the map's chips (null = guessed; undefined before the category migration). */
  category?: string | null;
  /** What the guess from the story's kind gives. */
  category_guess: CategoryId | null;
};

const STATUS: Record<Status, { bn: string; color: string }> = {
  ai: { bn: "AI · not verified", color: "#8a8178" },
  verified: { bn: "✓ Verified", color: "#b8860b" },
  hidden: { bn: "Hidden", color: "#cfc6b8" },
};
const REPORTED = "#c0392b";
/** Shown on the public map (show_on_map): blue, whatever its status; grey/gold pins are off the public map. */
const ON_MAP = "#2563eb";
/** A story's pin colour: blue when it is on the public map, else its status colour. */
const pinColor = (r: Pick<Row, "status" | "show_on_map">) => (r.show_on_map && r.status !== "hidden" ? ON_MAP : STATUS[r.status].color);

type Filter = "all" | Status | "reported" | "on_map";

/** The admin map: every saved story as a pin; click to check, edit, regenerate, verify or hide. */
export function AdminMap({ email }: { email?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"views" | "reports" | "recent">("views");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Refetched after every change in the story panel.
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    adminFetch("/api/admin/stories").then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (r.ok) setRows(data.stories);
      else setError(data.error ?? `HTTP ${r.status}`);
    });
  }, [version]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      ai: rows.filter((r) => r.status === "ai").length,
      verified: rows.filter((r) => r.status === "verified").length,
      hidden: rows.filter((r) => r.status === "hidden").length,
      reported: rows.filter((r) => r.reports > 0).length,
      on_map: rows.filter((r) => r.show_on_map).length,
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) =>
        filter === "all" ? true : filter === "reported" ? r.reports > 0 : filter === "on_map" ? !!r.show_on_map : r.status === filter,
      )
      .filter((r) => !q || r.name_bn.includes(q) || r.name_en?.toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "views" ? b.views - a.views : sort === "reports" ? b.reports - a.reports : b.updated_at.localeCompare(a.updated_at),
      );
  }, [rows, filter, sort, query]);

  // The map, created once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle("en")]); // English interface: English place names
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: container.current,
        style,
        center: [90.399, 23.716],
        zoom: 12,
        minZoom: MIN_ZOOM,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      lockFlat(map);
      mapRef.current = map;
      map.on("load", () => {
        map.addSource("stories", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "story-pins",
          type: "circle",
          source: "stories",
          paint: {
            "circle-color": ["get", "color"],
            // Bigger = opened more often.
            "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "views"]], 0, 6, 5, 11, 15, 18],
            "circle-stroke-color": ["case", [">", ["get", "reports"], 0], REPORTED, THEME.white],
            "circle-stroke-width": ["case", [">", ["get", "reports"], 0], 3.5, 2],
            "circle-opacity": ["case", ["==", ["get", "status"], "hidden"], 0.6, 1],
          },
        });
        map.addLayer({
          id: "story-selected",
          type: "circle",
          source: "stories",
          filter: ["==", ["get", "id"], ""],
          paint: { "circle-radius": 22, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": THEME.accent, "circle-stroke-width": 3 },
        });
        map.addLayer({
          id: "story-labels",
          type: "symbol",
          source: "stories",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 13,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": THEME.ink, "text-halo-color": THEME.white, "text-halo-width": 1.5 },
        });
        map.on("click", "story-pins", (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) setSelected(id);
        });
        map.on("mouseenter", "story-pins", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "story-pins", () => (map.getCanvas().style.cursor = ""));
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Pins follow the filters and search.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("stories") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: shown.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: { id: r.id, name: r.name_bn, status: r.status, views: r.views, reports: r.reports, color: pinColor(r) },
      })),
    });
  }, [ready, shown]);

  useEffect(() => {
    if (ready) mapRef.current?.setFilter("story-selected", ["==", ["get", "id"], selected ?? ""]);
  }, [ready, selected]);

  function select(r: Row) {
    setSelected(r.id);
    mapRef.current?.easeTo({ center: [r.lng, r.lat], zoom: Math.max(mapRef.current.getZoom(), 14), offset: [-240, 0] });
  }

  return (
    <div className="flex h-[calc(100dvh-var(--header-h))]">
      {/* List */}
      <aside className="hidden w-80 shrink-0 flex-col border-e border-line bg-paper md:flex">
        <div className="border-b border-line p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-3">
              <span className="font-bold">Admin</span>
              <Link href="/admin/events" className="font-semibold text-accent hover:underline">
                Historical events →
              </Link>
            </span>
            <button type="button" onClick={() => browserSupabase().auth.signOut()} className="text-muted underline" title={email}>
              Log out
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the list…"
            className="mt-2 w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {(
              [
                ["all", "All"],
                ["ai", "AI"],
                ["verified", "Verified"],
                ["on_map", "On map"],
                ["reported", "Reported"],
                ["hidden", "Hidden"],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2 py-0.5 ${filter === f ? "border-accent bg-accent text-white" : "border-line bg-card"}`}
              >
                {label} {counts[f]}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1 text-xs"
          >
            <option value="views">Most viewed first</option>
            <option value="reports">Most reported first</option>
            <option value="recent">Recently changed first</option>
          </select>
          {/* What the pin colours mean. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: ON_MAP }} aria-hidden /> On the public map
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: STATUS.ai.color }} aria-hidden /> Not on the map
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: STATUS.verified.color }} aria-hidden /> Verified, not on the map
            </span>
          </p>
        </div>
        {error && <p className="p-3 text-sm text-red-800">{error}</p>}
        <ul className="flex-1 overflow-y-auto">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => select(r)}
                className={`flex w-full items-center gap-2 border-b border-line/60 px-3 py-2 text-start hover:bg-card ${selected === r.id ? "bg-card" : ""}`}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: pinColor(r) }}
                  title={r.show_on_map && r.status !== "hidden" ? "Shown on the public map" : "Not on the public map"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name_bn}</span>
                  <span className="block truncate text-xs text-muted">{r.name_en}</span>
                </span>
                <span className="shrink-0 text-end text-xs text-muted">
                  👁 {r.views}
                  {(r.likes > 0 || r.dislikes > 0) && (
                    <span className="block">
                      👍 {r.likes} · 👎 {r.dislikes}
                    </span>
                  )}
                  {r.reports > 0 && <span className="block font-semibold text-red-700">⚑ {r.reports}</span>}
                </span>
              </button>
            </li>
          ))}
          {rows.length === 0 && !error && (
            <li className="p-3 text-sm text-muted">No stories saved yet. Click any place on the main map and it will show up here.</li>
          )}
        </ul>
        <div className="border-t border-line p-3 text-xs text-muted">
          <span className="me-3">
            <span className="me-1 inline-block size-2 rounded-full" style={{ background: STATUS.ai.color }} />
            AI
          </span>
          <span className="me-3">
            <span className="me-1 inline-block size-2 rounded-full" style={{ background: STATUS.verified.color }} />
            Verified
          </span>
          <span>
            <span className="me-1 inline-block size-2 rounded-full border-2" style={{ borderColor: REPORTED }} />
            Reported
          </span>
          <p className="mt-1">Bigger pin = opened more often</p>
        </div>
      </aside>

      {/* Map */}
      <div className="relative flex-1">
        <div className="absolute inset-0">
          <div ref={container} className="h-full w-full bg-[var(--map-ground)]" aria-label="Map of saved stories" />
        </div>
      </div>

      {selected && (
        <StoryPanel
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

/** One story with the admin's tools above it. */
function StoryPanel({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

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
    onChanged();
  }

  const act = (action: string, label: string) =>
    call(label, `/api/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });

  const button = "rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:border-accent disabled:opacity-50";

  return (
    <SidePanel title={detail?.name_bn ?? "Story"} onClose={onClose}>
      {!detail ? (
        <p className="py-8 text-muted">{error ?? "Loading…"}</p>
      ) : (
        <>
          {/* Admin tools */}
          <div className="sticky top-0 z-20 -mx-5 border-b border-line bg-paper/95 px-5 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: STATUS[detail.status].color }}>
                {STATUS[detail.status].bn}
              </span>
              <span className="text-muted">👁 {detail.views} views</span>
              <span className="text-muted">
                👍 {detail.likes ?? 0} · 👎 {detail.dislikes ?? 0}
              </span>
              {detail.reports > 0 && <span className="font-semibold text-red-700">⚑ {detail.reports} {detail.reports === 1 ? "report" : "reports"}</span>}
              <a
                href={aiShareUrl({ name: detail.name_bn, lat: detail.lat, lng: detail.lng, kind: detail.kind ?? undefined, slug: detail.slug ?? undefined })}
                target="_blank"
                rel="noreferrer"
                className="ms-auto text-accent underline"
              >
                View on site ↗
              </a>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {detail.status !== "verified" ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => act("verify", "verify")}
                  className="rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "verify" ? "…" : "✓ Verify"}
                </button>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => act("unverify", "unverify")} className={button}>
                  Unverify
                </button>
              )}
              {/* A pin on the public map: a simple on/off switch. */}
              <button
                type="button"
                role="switch"
                aria-checked={!!detail.show_on_map}
                disabled={!!busy || detail.status === "hidden"}
                title={detail.status === "hidden" ? "Hidden stories can't be shown on the map" : undefined}
                onClick={() => act(detail.show_on_map ? "hide_from_map" : "show_on_map", "map")}
                className={`${button} flex items-center gap-2 ${detail.show_on_map ? "border-accent bg-accent-soft text-accent" : ""}`}
              >
                <span
                  className={`relative inline-block h-4 w-7 rounded-full transition-colors ${detail.show_on_map ? "bg-accent" : "bg-line-strong"}`}
                  aria-hidden
                >
                  <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${detail.show_on_map ? "start-3.5" : "start-0.5"}`} />
                </span>
                {busy === "map" ? "…" : "Pin on map"}
              </button>
              <button type="button" disabled={!!busy} onClick={() => setEditing((e) => !e)} className={button}>
                {editing ? "Close editor" : "Edit"}
              </button>
              {!confirmRegen ? (
                <button type="button" disabled={!!busy} onClick={() => setConfirmRegen(true)} className={button}>
                  Rewrite
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => call("regen", `/api/admin/stories/${id}/regenerate`, { method: "POST" })}
                  className="rounded-full bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy === "regen" ? "AI is writing… (10–20 s)" : "Sure? The old story will be deleted"}
                </button>
              )}
              {detail.status !== "hidden" ? (
                <button type="button" disabled={!!busy} onClick={() => act("hide", "hide")} className={button}>
                  Hide
                </button>
              ) : (
                <button type="button" disabled={!!busy} onClick={() => act("unhide", "unhide")} className={button}>
                  Unhide
                </button>
              )}
            </div>
            {/* Category: the chip that finds this pin on the public map. */}
            <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Category</span>
              <select
                value={detail.category ?? ""}
                disabled={!!busy || detail.category === undefined}
                title={detail.category === undefined ? "Run the story_category migration first" : undefined}
                onChange={(e) =>
                  call("category", `/api/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify({ category: e.target.value || null }) })
                }
                className="rounded-full border border-line bg-card px-3 py-1.5 text-sm disabled:opacity-50"
              >
                <option value="">Automatic ({detail.category_guess ? categoryLabel(detail.category_guess) : "none"})</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.bn} · {c.en}
                  </option>
                ))}
                <option value={NO_CATEGORY}>None</option>
              </select>
              {busy === "category" && <span className="text-muted">…</span>}
            </label>
            {error && <p className="mt-2 text-sm text-red-800">{error}</p>}
          </div>

          {/* Visitors' reports */}
          {detail.report_list.length > 0 && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm">
              <p className="font-semibold text-red-800">Visitor reports</p>
              <ul className="mt-1 grid gap-1.5">
                {detail.report_list.map((r) => (
                  <li key={r.id} className="text-red-950">
                    “{r.message}” <span className="text-xs text-red-700">· {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={!!busy} onClick={() => act("clear_reports", "clear")} className="mt-2 text-xs font-semibold text-red-800 underline">
                Fixed, clear reports
              </button>
            </div>
          )}

          {/* The story's picture: change it (Wikimedia Commons, licence checked) or remove it. */}
          <div className="rounded-xl border border-line bg-card p-3">
            <p className="text-sm font-semibold">Image</p>
            <p className="mt-0.5 text-xs text-muted">Search Wikimedia Commons or browse photos taken nearby. Only images with a usable licence can be picked.</p>
            <div className="mt-2">
              <ImagePicker
                value={detail.image}
                near={{ lat: detail.lat, lng: detail.lng }}
                onChange={(image) => call("image", `/api/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify({ image }) })}
              />
            </div>
            {busy === "image" && <p className="mt-1 text-xs text-muted">Saving…</p>}
          </div>

          <VideoManager storyId={id} videos={detail.videos ?? []} onChange={(videos) => setDetail({ ...detail, videos })} />

          {editing ? (
            <StoryEditor
              story={detail.story}
              saving={busy === "save"}
              onSave={(story) => call("save", `/api/admin/stories/${id}`, { method: "PATCH", body: JSON.stringify({ story }) })}
            />
          ) : (
            <AiStory
              story={detail.story}
              image={detail.image ?? undefined}
              model={detail.model ?? undefined}
              streaming={false}
              fallbackName={detail.name_bn}
              at={{ lat: detail.lat, lng: detail.lng }}
              shareUrl={aiShareUrl({ name: detail.name_bn, lat: detail.lat, lng: detail.lng, kind: detail.kind ?? undefined, slug: detail.slug ?? undefined })}
              status={detail.status}
              videos={detail.videos}
            />
          )}
        </>
      )}
    </SidePanel>
  );
}
