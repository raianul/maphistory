"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent, MapMouseEvent, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { pinTarget, type MapPin } from "@/lib/map-pin";
import { BANGLADESH_ONLY, bangladeshShape, BD_MIN_ZOOM, inRegion, MAX_BOUNDS, outsideMask } from "@/lib/region";
import { PIN_MIN_ZOOM, tileKey, tilesInView, type Tile } from "@/lib/tiles";
import { HEAD_Y, pinImage } from "@/lib/map-markers";
import { bnDistance, haversine } from "@/lib/format";
import { initialMapLang, loadStyle, MIN_ZOOM, saveMapLang, setMapLang, type MapLang } from "@/lib/map-style";
import { searchPlaces, type GeoResult } from "@/lib/geo-search";
import { AiPanel, aiShareUrl, type AiTarget } from "./AiPanel";
import type { AiPlace } from "@/lib/ai/types";
import { OnThisDayPanel, STEP_REQUEST } from "./OnThisDayPanel";
import { OPEN_PLACE, type PlaceSource } from "./PlaceLink";
import { slugOf, track, withCampaign } from "@/lib/analytics";
import { StepPopup } from "./StepPopup";
import { SHEET_EVENT, SHEET_REQUEST } from "./SidePanel";
import { SearchBox } from "./SearchBox";
import { Brand, BrandMark, CategoryChips, LangSwitch, MoreMenu, OnThisDayCard, PinPreview, SectionNav, TabBar, ZoomButtons, type MapSection, type PinFilter, type PinPreviewData } from "./MapShell";
import { CollectionBar, CollectionsPanel } from "./Collections";
import { SocialLinks } from "./SocialLinks";
import { BirthdayPopup } from "./Birthday";
import type { PublicCollection } from "@/lib/collections";
import type { CategoryId } from "@/lib/categories";
import { THEME } from "@/lib/theme";
import { addEventLayers, allBounds, drawSteps, EVENT_CLICK_LAYERS, EVENT_LAYERS, stepBounds } from "@/lib/events/draw";
import type { PublicEvent } from "@/lib/events/public";
import type { TimelineStep } from "@/lib/events/schema";

const OLD_DHAKA: [number, number] = [90.399, 23.716];
const TIP_KEY = "jg-tip-seen";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];

function toGeoJSON(pins: MapPin[]): GeoData {
  return {
    type: "FeatureCollection",
    // Each feature carries what opening it needs (MapLibre keeps properties as plain values).
    features: pins.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        label: p.label,
        label_en: p.label_en ?? p.label,
        verified: p.verified,
        name: p.name,
        kind: p.kind ?? "",
        slug: p.slug ?? "",
        // For the chips and the hover preview.
        // ",park,liberation," so a chip's filter can look for ",park," (properties are plain values).
        categories: p.categories?.length ? `,${p.categories.join(",")},` : "",
        video: !!p.video,
        thumb: p.thumb ?? "",
        line: p.line ?? "",
        likes: p.likes ?? 0,
      },
    })),
  };
}

/** One square's pins from the server (cached there and by the browser). */
async function fetchTile(t: Tile, signal: AbortSignal): Promise<MapPin[]> {
  const res = await fetch(`/api/pins/${tileKey(t)}`, { signal });
  if (!res.ok) throw new Error(`pins ${tileKey(t)}: HTTP ${res.status}`);
  return ((await res.json()) as { pins: MapPin[] }).pins;
}

/**
 * The public map. Pins are saved stories the admin switched on ("ম্যাপে পিন"), loaded square by
 * square (see lib/tiles.ts): only the squares on screen, only from city zoom in, each once. Any
 * other named place on the base map can still be clicked for its story.
 */
/** The room the place panel takes on wide screens: its width plus the gap around it (a floating card). */
function panelSpace() {
  const css = getComputedStyle(document.documentElement);
  const rem = parseFloat(css.fontSize) || 16;
  const px = (v: string) => (v.trim().endsWith("rem") ? parseFloat(v) * rem : parseFloat(v)) || 0;
  return (px(css.getPropertyValue("--panel-w")) || 440) + 2 * px(css.getPropertyValue("--panel-gap"));
}

/**
 * @param curated slugs of the hand-written places (content/): their /place/<slug> is a route of its own.
 * @param initialAi a place page (/place/<slug>) rendered on the server: its story, open at once.
 */
export function PlaceMap({ curated = [], initialAi }: { curated?: string[]; initialAi?: { target: AiTarget; place: AiPlace } } = {}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  /** The map is turned or tilted (shouldn't happen any more): show the "straighten" button. */
  const [turned, setTurned] = useState(false);
  /** The language of the base map's place names (the content itself stays Bangla). */
  const [mapLang, setMapLangState] = useState<MapLang>("bn");
  const mapLangRef = useRef<MapLang>("bn");
  /** The map once loaded, for components drawn over it (refs can't be read while rendering). */
  const [mapObj, setMapObj] = useState<MLMap | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  // EXPERIMENT: a base-map place clicked for a live AI story.
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(initialAi?.target ?? null);
  /** A story already loaded (the page's own, or fetched for Back/Forward): shown without a request. */
  const [preload, setPreload] = useState<{ key: string; place: AiPlace } | null>(
    initialAi ? { key: `${initialAi.target.name}@${initialAi.target.lat},${initialAi.target.lng}`, place: initialAi.place } : null,
  );
  /** "On this day": closed, its list, or one event (by slug). One panel at a time with stories. */
  const [otd, setOtd] = useState<{ slug: string | null } | null>(null);
  /** Where the open event happened, for the ring on the map. */
  const [otdPlace, setOtdPlace] = useState<{ lat: number; lng: number } | null>(null);
  /** The open event's timeline, as shown: the event and the current step (−1 = story only, no timeline). */
  const [timeline, setTimeline] = useState<{ event: PublicEvent; step: number } | null>(null);
  // First-visit tip: shown until the visitor opens their first story.
  const [showTip, setShowTip] = useState(false);
  const tipMarker = useRef<Marker | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  /** The chip chosen above the map (one category, or "has a video"); null = every pin. */
  const [pinFilter, setPinFilter] = useState<PinFilter | null>(null);
  /** Zoomed in far enough for pins (and so for their chips). */
  const [pinsShown, setPinsShown] = useState(false);
  /** The collection shown on the map (only its places, numbered), and which of them is open. */
  const [coll, setColl] = useState<PublicCollection | null>(null);
  const [collAt, setCollAt] = useState<number | null>(null);
  /** The সংগ্রহ panel is open (the list, or the open collection). */
  const [collPanel, setCollPanel] = useState(false);
  const [collLoading, setCollLoading] = useState(false);
  /** The "সব ধরন" panel is open (the On this day card steps aside meanwhile). */
  const [kindsPanel, setKindsPanel] = useState(false);
  /** Desktop: the pin under the pointer, previewed in a small card. */
  const [preview, setPreview] = useState<PinPreviewData | null>(null);
  /** The floating search, so the map knows where its visible area begins. */
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Pins, square by square ──────────────────────────────────────────────────────────────
  /** Squares already loaded (key "z/x/y" → its pins), or in flight. Kept for the visit: panning back is free. */
  const tiles = useRef(new Map<string, MapPin[] | "loading">());
  /** Every pin loaded so far: drawn on the map and used by "near me". */
  const [pins, setPins] = useState<MapPin[]>([]);
  const tileAbort = useRef<AbortController | null>(null);

  /** Fetches the squares on screen that aren't loaded yet (only from city zoom in, where pins show). */
  function loadPins() {
    const map = mapRef.current;
    if (!map || map.getZoom() < PIN_MIN_ZOOM) return;
    const b = map.getBounds();
    const wanted = tilesInView({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    const missing = wanted.filter((t) => !tiles.current.has(tileKey(t)));
    if (!missing.length) return;
    tileAbort.current ??= new AbortController();
    const signal = tileAbort.current.signal;
    for (const t of missing) {
      const key = tileKey(t);
      tiles.current.set(key, "loading");
      fetchTile(t, signal)
        .then((found) => {
          tiles.current.set(key, found);
          if (found.length) setPins([...tiles.current.values()].flatMap((v) => (v === "loading" ? [] : v)));
        })
        // A square that failed (offline, server busy) is tried again on the next move.
        .catch(() => tiles.current.delete(key));
    }
  }
  const loadPinsRef = useRef(loadPins);
  useEffect(() => {
    loadPinsRef.current = loadPins;
  });
  // Leaving the page: stop squares still loading.
  useEffect(() => () => tileAbort.current?.abort(), []);

  // Draw the pins loaded so far.
  useEffect(() => {
    if (ready) (mapRef.current?.getSource("pins") as GeoJSONSource | undefined)?.setData(toGeoJSON(pins));
  }, [ready, pins]);

  // A chip shows only its pins (and their names).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const only = pinFilter === null ? null : pinFilter === "video" ? ["get", "video"] : ["in", `,${pinFilter},`, ["get", "categories"]];
    for (const id of ["pins", "pin-labels"]) map.setFilter(id, only as Parameters<MLMap["setFilter"]>[1]);
    setPreview(null);
  }, [ready, pinFilter]);
  /** The chips: the kinds of place among the pins loaded so far, the commonest first. */
  const pinKinds = useMemo(() => {
    const n = new Map<CategoryId, number>();
    for (const p of pins) for (const c of p.categories ?? []) n.set(c, (n.get(c) ?? 0) + 1);
    return [...n].map(([id, count]) => ({ id, n: count })).sort((a, b) => b.n - a.n);
  }, [pins]);
  const pinVideos = pins.filter((p) => p.video).length;

  // The open place comes from the URL: /place/<slug> shows its story in the side panel.
  const router = useRouter();
  const pathname = usePathname();
  // A hand-written place's own route (/place/<slug>); an AI story's page address is not one of these.
  const pathSlug = pathname.match(/^\/place\/([^/]+)/)?.[1] ?? null;
  const selected = pathSlug && curated.includes(pathSlug) ? pathSlug : null;

  /** Whether the open story's history entry was pushed here (so closing = Back to the map). */
  const openedHere = useRef(false);
  /** How much of the screen the phone sheet covers right now (px), as told by SidePanel. */
  const sheetPx = useRef(0);
  /** The place the panel is about, so the map can keep it in view when the sheet moves. */
  const focusPoint = useRef<{ lng: number; lat: number } | null>(null);

  /**
   * Moves the map so a point sits in the middle of the map that is still
   * visible: left of the panel on desktop; on phones, between the search bar
   * and the bottom sheet (whatever height it has).
   */
  function focus(lng: number, lat: number, zoom?: number) {
    const map = mapRef.current;
    if (!map) return;
    focusPoint.current = { lng, lat };
    const wide = window.matchMedia("(min-width: 768px)").matches;
    // Half the panel's width (a CSS token), so the point sits in the middle of the visible map.
    const panel = panelSpace();
    // Phones: the sheet opens at half height before it has reported in.
    const sheet = sheetPx.current || Math.round(window.innerHeight * 0.56);
    const top = overlayRef.current?.getBoundingClientRect().bottom ?? 0;
    const mapTop = container.current?.getBoundingClientRect().top ?? 0;
    const mapH = container.current?.clientHeight ?? window.innerHeight;
    // Visible band in map coordinates: from below the search to above the sheet.
    const bandTop = Math.max(0, top - mapTop);
    const bandBottom = Math.max(bandTop + 40, mapH - sheet);
    const dy = Math.round((bandTop + bandBottom) / 2 - mapH / 2);
    map.easeTo({
      center: [lng, lat],
      zoom: zoom ?? map.getZoom(),
      offset: wide ? [-Math.round(panel / 2), 0] : [0, dy],
      duration: zoom ? 1200 : 600,
    });
  }

  /** The side panel's width on wide screens (0 on phones), from its CSS token. */
  function panelWidth() {
    if (typeof window === "undefined" || !window.matchMedia("(min-width: 768px)").matches) return 0;
    return panelSpace();
  }

  /** The map's free area (what the panel and search leave visible), as fitBounds padding. */
  function freePadding() {
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const panel = panelSpace();
    const top = Math.max(0, (overlayRef.current?.getBoundingClientRect().bottom ?? 0) - (container.current?.getBoundingClientRect().top ?? 0));
    const sheet = sheetPx.current || Math.round(window.innerHeight * 0.56);
    return wide ? { top: top + 40, bottom: 60, left: 60, right: panel + 60 } : { top: top + 24, bottom: sheet + 24, left: 32, right: 32 };
  }

  /** Frames a timeline step in the free area. Unknown places (no bounds) never move the map. */
  const eventFrame = useRef<[[number, number], [number, number]] | null>(null);
  function frameStep(b: [[number, number], [number, number]] | undefined) {
    const map = mapRef.current;
    if (!map || !b) return;
    eventFrame.current = b;
    focusPoint.current = null;
    map.fitBounds(b, { padding: freePadding(), maxZoom: 15, duration: 900 });
  }

  // The sheet moved (peek, half, full): keep the place in the visible part of the map.
  useEffect(() => {
    const onSheet = (e: Event) => {
      const px = (e as CustomEvent<number>).detail;
      const changed = Math.abs(px - sheetPx.current) > 8;
      sheetPx.current = px;
      if (changed && px > 0 && focusPoint.current) focus(focusPoint.current.lng, focusPoint.current.lat);
      else if (changed && px > 0 && eventFrame.current) frameStep(eventFrame.current);
    };
    window.addEventListener(SHEET_EVENT, onSheet);
    return () => window.removeEventListener(SHEET_EVENT, onSheet);
  });

  function dismissTip() {
    setShowTip(false);
    tipMarker.current?.remove();
    tipMarker.current = null;
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      // storage blocked: the tip may show again next visit
    }
  }

  /** EXPERIMENT: opens a live AI story for any named place on the base map. */
  function openAi(target: AiTarget, zoom?: number, source: PlaceSource = "map") {
    track("place_open", { slug: target.slug, place_name: target.name, source });
    setCollPanel(false);
    // A place with a hand-written page (e.g. Ahsan Manzil): that page, in its own panel.
    if (target.slug && curated.includes(target.slug)) {
      dismissTip();
      setAiTarget(null);
      setOtd(null);
      router.push(`/place/${target.slug}`, { scroll: false });
      return;
    }
    if (selected) router.replace("/", { scroll: false });
    dismissTip();
    // The address bar carries the place's page (/place/<slug>, or a link that finds it while it is
    // new), so it can be shared and reopened. Opening one from the map adds a history entry, so the
    // phone's Back button closes it; switching places replaces it.
    const url = aiShareUrl(target);
    if (aiTarget || selected || window.location.pathname.startsWith("/place/") || new URLSearchParams(window.location.search).has("place")) {
      window.history.replaceState(window.history.state, "", withCampaign(url));
    } else {
      window.history.pushState(window.history.state, "", url);
      openedHere.current = true;
    }
    setOtd(null);
    setOtdPlace(null);
    setTimeline(null);
    setAiTarget(target);
    focus(target.lng, target.lat, zoom);
  }

  // ── "On this day" ───────────────────────────────────────────────────────────────────────
  /**
   * The address of the list, or of a story. Opened from a date in the list, it carries that date
   * (on=MM-DD: the story shows that day's title) and the step it starts at.
   */
  const otdUrl = (slug: string | null, at?: { md: string; step: number | null }) =>
    slug ? `/?event=${encodeURIComponent(slug)}${at ? `&on=${at.md}${at.step ? `&step=${at.step}` : ""}` : ""}` : "/?day=today";
  /** Opens the list (from the button) or an event (from the list or a shared link). */
  function openOtd(slug: string | null, place?: { lat: number; lng: number } | null, at?: { md: string; step: number | null }) {
    setCollPanel(false);
    if (selected) router.replace("/", { scroll: false });
    dismissTip();
    const url = otdUrl(slug, at);
    const p = new URLSearchParams(window.location.search);
    // From the plain map: a new history entry (Back closes it). Inside the panel or a story: replace.
    if (otd || aiTarget || p.has("event") || p.has("day") || p.has("place")) {
      window.history.replaceState(window.history.state, "", withCampaign(url));
    } else {
      window.history.pushState(window.history.state, "", url);
      openedHere.current = true;
    }
    setAiTarget(null);
    setOtd({ slug });
    setOtdPlace(place ?? null);
    if (place) focus(place.lng, place.lat, Math.max(mapRef.current?.getZoom() ?? 13, 13));
  }
  function closeOtd() {
    setOtd(null);
    setOtdPlace(null);
    setTimeline(null);
    focusPoint.current = null;
    if (openedHere.current) window.history.back();
    else window.history.replaceState(window.history.state, "", withCampaign("/"));
    openedHere.current = false;
  }

  function closeAi() {
    setAiTarget(null);
    focusPoint.current = null;
    // Opened from the map: step back to the map's own entry. Opened from a shared link: just clear the URL.
    if (openedHere.current) window.history.back();
    else window.history.replaceState(window.history.state, "", withCampaign("/"));
    openedHere.current = false;
  }

  const curatedRef = useRef(curated);
  const initialAiRef = useRef(initialAi);
  // Back/forward: the story follows the address bar (Back from a story returns to the plain map).
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const at = params.get("at")?.split(",").map(Number);
      const name = params.get("place");
      const slug = window.location.pathname.match(/^\/place\/([^/]+)/)?.[1];
      if (slug) {
        // A hand-written place is its own route (Next shows it); an AI place is loaded by its address.
        setOtd(null);
        setTimeline(null);
        if (curatedRef.current.includes(slug)) return setAiTarget(null);
        fetch(`/api/place/${slug}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { target?: AiTarget; place?: AiPlace } | null) => {
            if (!d?.target || !d.place) return setAiTarget(null);
            setPreload({ key: `${d.target.name}@${d.target.lat},${d.target.lng}`, place: d.place });
            setAiTarget(d.target);
          })
          .catch(() => setAiTarget(null));
      } else if (name && at?.length === 2 && at.every(Number.isFinite)) {
        setOtd(null);
        setTimeline(null);
        setAiTarget({ name, lat: at[0], lng: at[1], kind: params.get("kind") ?? undefined });
      } else if (params.has("event") || params.has("day")) {
        setAiTarget(null);
        setOtd({ slug: params.get("event") });
        if (!params.has("event")) setOtdPlace(null);
      } else {
        setAiTarget(null);
        setOtd(null);
        setOtdPlace(null);
        setTimeline(null);
        focusPoint.current = null;
        openedHere.current = false;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** A search result: fly there and tell its story. */
  function openGeo(r: GeoResult, source: PlaceSource = "search") {
    openAi({ name: r.name, lat: r.lat, lng: r.lng, kind: r.kind, nearby: r.context ? [r.context] : undefined }, r.zoom, source);
  }

  /**
   * A place's page, opened in the map (a link to /place/<slug> from "On this day"): a hand-written
   * page is its own route; a map story is loaded and opened like a click on it.
   */
  async function openPlacePage(slug: string, source: PlaceSource) {
    if (curatedRef.current.includes(slug)) return openAi({ name: slug, lat: 0, lng: 0, slug }, undefined, source);
    const d = await fetch(`/api/place/${slug}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ target?: AiTarget; place?: AiPlace }>) : null))
      .catch(() => null);
    if (!d?.target || !d.place) return router.push(`/place/${slug}`);
    setPreload({ key: `${d.target.name}@${d.target.lat},${d.target.lng}`, place: d.place });
    openAi(d.target, 15, source);
  }
  const openPlaceRef = useRef(openPlacePage);
  useEffect(() => {
    openPlaceRef.current = openPlacePage;
  });
  useEffect(() => {
    const onOpen = (e: Event) => {
      const { slug, source } = (e as CustomEvent<{ slug: string; source: PlaceSource }>).detail;
      void openPlaceRef.current(slug, source);
    };
    window.addEventListener(OPEN_PLACE, onOpen);
    return () => window.removeEventListener(OPEN_PLACE, onOpen);
  }, []);

  // A place page opened directly (a shared link, a search result): counted once.
  useEffect(() => {
    const t = initialAiRef.current?.target;
    const slug = t?.slug ?? slugOf(window.location.pathname);
    if (slug) track("place_open", { slug, place_name: t?.name, source: "link" });
  }, []);

  /** A place named inside a story ("এখানে যা আছে"): find it near the current one and open it. */
  async function exploreByName(name: string) {
    const near = aiTarget ?? (mapRef.current ? { lat: mapRef.current.getCenter().lat, lng: mapRef.current.getCenter().lng } : undefined);
    const results = await searchPlaces(name, { near, limit: 3 }).catch(() => [] as GeoResult[]);
    const hit = near ? results.find((r) => haversine(near, r) < 10_000) : results[0];
    if (hit) openGeo(hit, "explore");
    else if (near) openAi({ name, lat: near.lat, lng: near.lng, nearby: aiTarget ? [aiTarget.name] : undefined }, undefined, "explore");
  }

  // The map's click handlers are registered once; this ref always points at the latest openAi.
  const aiRef = useRef(openAi);
  const collStepRef = useRef(stepCollection);
  useEffect(() => {
    aiRef.current = openAi;
    collStepRef.current = stepCollection;
  });

  // ── Collections ────────────────────────────────────────────────────────────────────────
  /** Shows a published collection on the map: only its places, numbered, framed together. */
  async function openCollection(slug: string) {
    setCollLoading(true);
    const r = await fetch(`/api/collections/${encodeURIComponent(slug)}`).catch(() => null);
    const c = r?.ok ? ((await r.json()).collection as PublicCollection) : null;
    setCollLoading(false);
    if (!c || !c.places.length) return;
    leavePanels();
    setCollPanel(true);
    setPinFilter(null);
    setPreview(null);
    setColl(c);
    setCollAt(null);
    track("collection_open", { slug: c.slug });
    if (window.location.pathname === "/") window.history.replaceState(window.history.state, "", withCampaign(`/?collection=${c.slug}`));
  }
  /** The সংগ্রহ panel with its list (from the menu). */
  function openCollections() {
    leavePanels();
    setCollPanel(true);
  }
  /** Closes a place, the day's events or a hand-written page, for the সংগ্রহ panel (no history games). */
  function leavePanels() {
    if (selected) router.replace("/", { scroll: false });
    setAiTarget(null);
    setOtd(null);
    setOtdPlace(null);
    setTimeline(null);
    dismissTip();
  }
  /** Back to every pin. */
  function closeCollection() {
    setColl(null);
    setCollAt(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("collection")) {
      url.searchParams.delete("collection");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }
  /** Opens the collection's place number i + 1 (as clicking its pin does). */
  function stepCollection(i: number) {
    const p = coll?.places[i];
    if (!p) return;
    setCollAt(i);
    setCollPanel(false);
    openAi(pinTarget(p), Math.max(mapRef.current?.getZoom() ?? 15, 15), "collection");
  }
  // A shared link (/?collection=<slug>): open it once the map is ready.
  useEffect(() => {
    if (!ready) return;
    const slug = new URLSearchParams(window.location.search).get("collection");
    if (slug) queueMicrotask(() => openCollection(slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the map is ready
  }, [ready]);
  // Draw the collection (or nothing), hide the other pins meanwhile, and frame all its places.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("collection") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: (coll?.places ?? []).map((p, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { i, num: (i + 1).toLocaleString("bn-BD"), label: p.label, label_en: p.label_en ?? p.label },
      })),
    });
    // The other pins (and the zoomed-out area counts) step aside while a collection is shown.
    for (const id of ["pins", "pin-labels", "areas-c", "areas-f"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", coll ? "none" : "visible");
    if (!coll) return;
    const lngs = coll.places.map((p) => p.lng);
    const lats = coll.places.map((p) => p.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: freePadding(), maxZoom: 15, duration: 900 },
    );
  }, [ready, coll]);

  // Create the map once; maplibre-gl is loaded only on this page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The visitor's saved choice, or their browser's language (English browsers get English names).
      const lang = initialMapLang();
      mapLangRef.current = lang;
      setMapLangState(lang);
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle(lang)]);
      if (cancelled || !container.current) return;
      // Copied to public/ by the predev/prebuild scripts (MapLibre 6 ships its worker separately).
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: container.current,
        style,
        center: OLD_DHAKA,
        zoom: 13.5,
        // Bangladesh only (lib/region.ts): the map stays over Bangladesh and can't zoom out past it.
        minZoom: BANGLADESH_ONLY ? BD_MIN_ZOOM : MIN_ZOOM,
        maxBounds: BANGLADESH_ONLY ? MAX_BOUNDS : undefined,
        renderWorldCopies: !BANGLADESH_ONLY,
        attributionControl: { compact: true },
        // A flat, north-up map: no turning or tilting (right-drag, ctrl-drag, two-finger twist), which
        // left visitors with a sideways map and no way back.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      // Bottom right, out of the way of search; hidden on touch screens (see globals.css).
      // Safety net: if the map is ever turned or tilted anyway, a compass appears to put it straight.
      const straighten = () => setTurned(Math.abs(map.getBearing()) > 0.5 || map.getPitch() > 0.5);
      map.on("rotate", straighten);
      map.on("pitch", straighten);
      mapRef.current = map;
      // Handy for debugging and browser tests in development.
      if (process.env.NODE_ENV === "development") (window as unknown as { __map: MLMap }).__map = map;

      map.on("load", () => {
        // Bangladesh only: everything outside the border is covered with the map's own blank ground
        // colour, with a hairline along the border. The cover goes under the base map's labels, so
        // names near the border are drawn whole; place names outside Bangladesh are filtered out.
        if (BANGLADESH_ONLY) {
          const style = map.getStyle();
          const firstLabel = style.layers.find((l) => l.type === "symbol")?.id;
          map.addSource("outside", { type: "geojson", data: outsideMask() });
          map.addLayer({ id: "outside", type: "fill", source: "outside", paint: { "fill-color": THEME.mapGround, "fill-antialias": false } }, firstLabel);
          map.addLayer(
            {
              id: "outside-border",
              type: "line",
              source: "outside",
              paint: { "line-color": THEME.borderLine, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 12, 1.5] },
            },
            firstLabel,
          );
          // Point labels (towns, areas, places): only those inside Bangladesh. Road and river names
          // are lines; outside ones would be hidden as well, but a line crossing the border would
          // vanish too, so those stay (their roads are under the cover anyway).
          const inside = ["within", bangladeshShape()];
          for (const l of style.layers) {
            if (l.type !== "symbol" || /highway|transportation|water_name|waterway|shield/.test(l.id)) continue;
            const current = map.getFilter(l.id);
            map.setFilter(l.id, (current ? ["all", current, inside] : inside) as Parameters<MLMap["setFilter"]>[1]);
          }
        }
        map.addSource("pins", { type: "geojson", data: toGeoJSON([]) });
        // Pins are local places: shown from city zoom in (they fade in), never stacked on top of a
        // country when the map shows a continent or the world.
        const fadeIn = (from: number) => ["interpolate", ["linear"], ["zoom"], from, 0, from + 1, 1] as unknown as number;
        // Markers in the logo's pin shape: every place the same (visitors aren't told which ones the
        // admin has reviewed). Numbered ones (areas, collections): a bigger pin with the number in its head.
        const marker = (id: string, m: Parameters<typeof pinImage>[0]) => {
          const { image, pixelRatio } = pinImage(m);
          if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio });
        };
        marker("pin-place", { width: 20, fill: THEME.accent, stroke: THEME.white, strokeWidth: 2, dot: THEME.white });
        marker("pin-number", { width: 30, fill: THEME.accent, stroke: THEME.white, strokeWidth: 2 });
        // Each image has a few px of room below the tip (for the outline and shadow): moved down by
        // that much, the tip sits exactly on the place. PIN_NUMBER_HEAD: tip to the head's centre.
        const TIP: [number, number] = [0, 4];
        const PIN_NUMBER_HEAD = (1 - HEAD_Y) * ((30 * 60) / 48);
        map.addLayer({
          id: "pins",
          type: "symbol",
          source: "pins",
          minzoom: PIN_MIN_ZOOM,
          layout: {
            "icon-image": "pin-place",
            "icon-anchor": "bottom",
            "icon-offset": TIP,
            "icon-size": ["interpolate", ["linear"], ["zoom"], PIN_MIN_ZOOM, 0.8, 15, 1],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": fadeIn(PIN_MIN_ZOOM) },
        });
        map.addLayer({
          id: "pin-labels",
          type: "symbol",
          source: "pins",
          // Names a step later than the dots, once there is room for them.
          minzoom: PIN_MIN_ZOOM + 1,
          layout: {
            "text-field": ["get", mapLangRef.current === "en" ? "label_en" : "label"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 14,
            "text-offset": [0, 0.35],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: {
            "text-color": THEME.ink,
            "text-halo-color": THEME.white,
            "text-halo-width": 1.5,
            "text-opacity": fadeIn(PIN_MIN_ZOOM + 1),
          },
        });
        // Zoomed out (pins load only from city zoom): one numbered circle per area, how many places
        // it has. Large areas for the whole country, smaller ones a step closer; clicking one zooms in.
        map.addSource("areas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        const AREA_LEVELS = [
          { id: "areas-c", level: "coarse", min: 0, max: 8 },
          { id: "areas-f", level: "fine", min: 8, max: PIN_MIN_ZOOM },
        ];
        // The number sits in the pin's round head: as far above the point as the head is (in ems of the
        // 13 px text), scaled with the pin. Areas with more places get a slightly bigger pin.
        const headEm = (scale: number, size = 13) => -((PIN_NUMBER_HEAD * scale) / size);
        // Bigger counts get a bigger pin (and a touch smaller digits), so ১২০ or ১২৫০ fits its head.
        const SIZES = [
          { from: 1, scale: 0.95, text: 13 },
          { from: 10, scale: 1.05, text: 13 },
          { from: 100, scale: 1.3, text: 12 },
          { from: 1000, scale: 1.55, text: 12 },
        ];
        const bySize = (pick: (z: (typeof SIZES)[number]) => unknown) => ["step", ["get", "n"], pick(SIZES[0]), ...SIZES.slice(1).flatMap((z) => [z.from, pick(z)])];
        for (const a of AREA_LEVELS) {
          map.addLayer({
            id: a.id,
            type: "symbol",
            source: "areas",
            minzoom: a.min,
            maxzoom: a.max,
            filter: ["==", ["get", "level"], a.level],
            layout: {
              "icon-image": "pin-number",
              "icon-anchor": "bottom",
              "icon-offset": TIP,
              "icon-size": bySize((z) => z.scale) as unknown as number,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "text-field": ["get", "label"],
              "text-font": ["Noto Sans Bold"],
              "text-size": bySize((z) => z.text) as unknown as number,
              "text-offset": bySize((z) => ["literal", [0, headEm(z.scale, z.text)]]) as unknown as [number, number],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: { "text-color": THEME.white },
          });
          map.on("click", a.id, (e: MapLayerMouseEvent) => {
            const f = e.features?.[0];
            if (!f || f.geometry.type !== "Point") return;
            const [lng, lat] = f.geometry.coordinates as [number, number];
            map.flyTo({ center: [lng, lat], zoom: a.level === "coarse" ? 8.6 : PIN_MIN_ZOOM + 1, duration: 900 });
          });
          map.on("mouseenter", a.id, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", a.id, () => (map.getCanvas().style.cursor = ""));
        }
        fetch("/api/pins/areas")
          .then((res) => (res.ok ? res.json() : null))
          .then((d: { coarse: { lat: number; lng: number; n: number }[]; fine: { lat: number; lng: number; n: number }[] } | null) => {
            if (!d) return;
            const features = (["coarse", "fine"] as const).flatMap((level) =>
              d[level].map((a) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
                properties: { level, n: a.n, label: a.n.toLocaleString("bn-BD", { useGrouping: false }) },
              })),
            );
            (map.getSource("areas") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
          })
          .catch(() => {});
        // A collection's places: numbered pins (above everything of ours), names under them.
        map.addSource("collection", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "coll-pins",
          type: "symbol",
          source: "collection",
          layout: {
            "icon-image": "pin-number",
            "icon-anchor": "bottom",
            "icon-offset": TIP,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "text-field": ["get", "num"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 13,
            "text-offset": [0, headEm(1)],
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: { "text-color": THEME.white },
        });
        map.addLayer({
          id: "coll-labels",
          type: "symbol",
          source: "collection",
          layout: {
            "text-field": ["get", mapLangRef.current === "en" ? "label_en" : "label"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 14,
            "text-offset": [0, 0.35],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": THEME.ink, "text-halo-color": THEME.white, "text-halo-width": 1.5 },
        });
        map.on("click", "coll-pins", (e: MapLayerMouseEvent) => {
          const i = e.features?.[0]?.properties?.i;
          if (typeof i === "number") collStepRef.current(i);
        });
        map.on("mouseenter", "coll-pins", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "coll-pins", () => (map.getCanvas().style.cursor = ""));
        map.on("click", "pins", (e: MapLayerMouseEvent) => {
          setPreview(null);
          const f = e.features?.[0];
          if (!f || f.geometry.type !== "Point") return;
          const [lng, lat] = f.geometry.coordinates as [number, number];
          const { name, kind, label, verified, slug } = f.properties as { name: string; kind: string; label: string; verified: boolean; slug?: string };
          aiRef.current(pinTarget({ name, lat, lng, kind: kind || undefined, label, verified, slug: slug || undefined }), undefined, "pin");
        });
        // Squares of pins: fetched for what is on screen, after every move (and once now).
        map.on("moveend", () => loadPinsRef.current());
        loadPinsRef.current();
        // The AI gets the Bangla name (stories are written in Bangla); the hover hint shows the name
        // in the map's language, as on the label.
        const labelOf = (props: Record<string, unknown> | undefined) =>
          (props?.["name:bn"] ?? props?.name) as string | undefined;
        const shownLabel = (props: Record<string, unknown> | undefined) =>
          (mapLangRef.current === "en" ? (props?.["name:en"] ?? props?.["name_en"] ?? props?.["name:latin"] ?? props?.name) : labelOf(props)) as string | undefined;
        // EXPERIMENT: any named place on the base map opens a live AI story:
        // places, points of interest, road names and rivers or lakes.
        const labelLayers = map
          .getStyle()
          .layers.filter((l) => l.type === "symbol" && /^(poi|label_|airport|highway-name|water_name|waterway)/.test(l.id))
          .map((l) => l.id);
        map.on("click", (e: MapMouseEvent) => {
          if (e.defaultPrevented) return; // an event step's pin
          if (map.queryRenderedFeatures(e.point, { layers: ["pins", "coll-pins", "areas-c", "areas-f", ...EVENT_CLICK_LAYERS.filter((id) => map.getLayer(id))] }).length) return;
          const { x, y } = e.point;
          // A generous box, so small road names are easy to hit on a phone.
          const f = map.queryRenderedFeatures(
            [
              [x - 16, y - 16],
              [x + 16, y + 16],
            ],
            { layers: labelLayers },
          )[0];
          const name = labelOf(f?.properties);
          if (!f || !name) return;
          // Roads and rivers are lines: the clicked spot is the location.
          const [lng, lat] = f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : [e.lngLat.lng, e.lngLat.lat];
          // Bangladesh only: places under the blank-out (other countries) are not clickable.
          if (!inRegion(lat, lng) || !inRegion(e.lngLat.lat, e.lngLat.lng)) return;
          // Category and surrounding labels tell the AI which place of this name it is.
          const cls = (f.properties?.class ?? f.properties?.subclass) as string | undefined;
          const kind =
            f.sourceLayer === "transportation_name"
              ? `road or street${cls ? ` (${cls})` : ""}`
              : f.sourceLayer === "water_name" || f.sourceLayer === "waterway"
                ? `river, canal or lake${cls ? ` (${cls})` : ""}`
                : (cls ?? f.layer.id);
          const nearby = [
            ...new Set(
              map
                .queryRenderedFeatures(
                  [
                    [x - 200, y - 200],
                    [x + 200, y + 200],
                  ],
                  { layers: labelLayers },
                )
                .map((n) => labelOf(n.properties))
                .filter((n): n is string => !!n && n !== name),
            ),
          ].slice(0, 6);
          aiRef.current({ name, lat, lng, kind, nearby });
        });
        // Hover hint: the label's name and "বিস্তারিত", following the pointer (not over the blank-out).
        map.on("mousemove", labelLayers, (e: MapLayerMouseEvent) => {
          const tip = tooltip.current;
          const name = shownLabel(e.features?.[0]?.properties);
          if (!tip) return;
          // Over one of our pins: its own preview card shows instead.
          if (map.queryRenderedFeatures(e.point, { layers: ["pins", "coll-pins", "areas-c", "areas-f"] }).length) {
            tip.hidden = true;
            return;
          }
          if (!name || !inRegion(e.lngLat.lat, e.lngLat.lng)) {
            tip.hidden = true;
            map.getCanvas().style.cursor = "";
            return;
          }
          map.getCanvas().style.cursor = "pointer";
          tip.querySelector("span")!.textContent = name;
          tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
          tip.hidden = false;
        });
        map.on("mouseleave", labelLayers, () => {
          map.getCanvas().style.cursor = "";
          if (tooltip.current) tooltip.current.hidden = true;
        });
        map.addSource("ai-target", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // Drawn under the reviewed pins: on a pin it reads as one ring around it, elsewhere as its own marker.
        map.addLayer({
          id: "ai-target",
          type: "circle",
          source: "ai-target",
          paint: { "circle-radius": 13, "circle-color": THEME.accentHalo, "circle-stroke-color": THEME.accent, "circle-stroke-width": 2 },
        }, "pins");
        // A solid centre dot, so the exact spot is clear at any zoom.
        map.addLayer({
          id: "ai-target-dot",
          type: "circle",
          source: "ai-target",
          paint: { "circle-radius": 4, "circle-color": THEME.accent, "circle-stroke-color": THEME.white, "circle-stroke-width": 1.5 },
        }, "pins");
        // Desktop hover preview: a small card above the pin (below it near the top of the map).
        let hovered = "";
        const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
        map.on("mouseenter", "pins", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "pins", () => {
          map.getCanvas().style.cursor = "";
          hovered = "";
          setPreview(null);
        });
        map.on("mousemove", "pins", (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (!canHover || !f || f.geometry.type !== "Point") return;
          const p = f.properties as { name: string; label: string; label_en: string; line: string; thumb: string; verified: boolean; likes: number };
          const key = `${p.name}@${(f.geometry.coordinates as number[]).join(",")}`;
          if (key === hovered) return;
          hovered = key;
          if (tooltip.current) tooltip.current.hidden = true;
          const at = map.project(f.geometry.coordinates as [number, number]);
          const width = map.getContainer().clientWidth;
          setPreview({
            label: mapLangRef.current === "en" ? p.label_en : p.label,
            line: p.line || undefined,
            thumb: p.thumb || undefined,
            verified: p.verified,
            likes: p.likes || undefined,
            x: Math.min(Math.max(at.x, 140), width - 140),
            y: at.y,
            below: at.y < (p.thumb ? 330 : 200),
          });
        });
        map.on("movestart", () => {
          hovered = "";
          setPreview(null);
        });
        // Chips only where pins show.
        const zoomed = () => setPinsShown(map.getZoom() >= PIN_MIN_ZOOM);
        map.on("zoomend", zoomed);
        zoomed();
        // Event timelines (On this day): drawn under the pins, over the base map.
        addEventLayers(map, THEME.white, THEME.ink);
        for (const id of EVENT_LAYERS) if (map.getLayer(id)) map.moveLayer(id, "ai-target");
        // A step's pin opens that step (its card on the map; the panel follows).
        for (const id of EVENT_CLICK_LAYERS) {
          map.on("click", id, (e: MapLayerMouseEvent) => {
            const i = e.features?.find((f) => f.properties?.step !== undefined)?.properties?.step;
            if (i === undefined) return;
            e.preventDefault();
            window.dispatchEvent(new CustomEvent(STEP_REQUEST, { detail: Number(i) }));
          });
          map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
        }
        setReady(true);
        setMapObj(map);

        // A place page (/place/<slug>): its story is already open; centre the map on it.
        if (initialAiRef.current) {
          const t = initialAiRef.current.target;
          focus(t.lng, t.lat, 15);
          return;
        }
        // An older shared AI story link (/?place=…&at=lat,lng) reopens that story.
        const params = new URLSearchParams(window.location.search);
        const at = params.get("at")?.split(",").map(Number);
        const shared = params.get("place");
        // (Bangladesh only: a link to a place elsewhere just opens the map.)
        // A shared "On this day" link (/?event=slug or /?day=…) reopens that panel.
        if (params.has("event") || params.has("day")) {
          setOtd({ slug: params.get("event") });
          return;
        }
        if (shared && at?.length === 2 && at.every(Number.isFinite) && inRegion(at[0], at[1])) {
          aiRef.current({ name: shared, lat: at[0], lng: at[1], kind: params.get("kind") ?? undefined }, 15, "link");
          return;
        }

        // First visit: point at a real label near the middle of the map.
        let seen = false;
        try {
          seen = localStorage.getItem(TIP_KEY) === "1";
        } catch {
          // storage blocked: treat as a first visit
        }
        if (seen) return;
        map.once("idle", () => {
          const { width, height } = map.getCanvas().getBoundingClientRect();
          const target = map
            .queryRenderedFeatures(
              [
                [width * 0.3, height * 0.35],
                [width * 0.7, height * 0.75],
              ],
              { layers: labelLayers.filter((id) => /^(label_|poi)/.test(id)) },
            )
            .find((f) => {
              if (f.geometry.type !== "Point" || !labelOf(f.properties)) return false;
              const [lng, lat] = f.geometry.coordinates as [number, number];
              return inRegion(lat, lng);
            });
          if (target && !tipMarker.current) {
            // MapLibre positions the marker with `transform`, so the animated ring sits inside it.
            const holder = document.createElement("div");
            holder.appendChild(document.createElement("div")).className = "tip-ring";
            tipMarker.current = new maplibregl.Marker({ element: holder })
              .setLngLat(target.geometry.coordinates as [number, number])
              .addTo(map);
          }
          setShowTip(true);
        });
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);


  // Ring around the place the AI is writing about.
  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("ai-target") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: (aiTarget ?? (timeline && timeline.step >= 0 ? null : otdPlace))
        ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [(aiTarget ?? otdPlace)!.lng, (aiTarget ?? otdPlace)!.lat] } }]
        : [],
    });
  }, [ready, aiTarget, otdPlace, timeline]);

  // Draw the open event's timeline up to its current step, and frame that step. With no timeline
  // (or after the event closes) the layers are emptied and the base map comes back to full strength.
  const shownStep = timeline && timeline.step >= 0 ? timeline.event.steps[timeline.step] : undefined;
  /** The base map's own label/pin opacities, saved before dimming them for a timeline. */
  const baseOpacity = useRef(new Map<string, unknown>());
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const steps = (timeline?.event.steps ?? []) as unknown as TimelineStep[];
    // Every step at once, numbered and joined in order (the current one stands out); phones too, so
    // the shape of the story is visible behind the sheet.
    drawSteps(map, steps, timeline?.event.phases ?? [], timeline && timeline.step >= 0 ? timeline.step : -1, { all: true });
    // While a timeline plays, the rest of the map steps back (still clickable). Each layer's own
    // opacity is remembered once and put back exactly when the timeline ends.
    const dim = !!timeline && timeline.step >= 0;
    const targets = map
      .getStyle()
      .layers.filter((l) => !EVENT_LAYERS.includes(l.id) && (/^(poi|label_|highway-name|water_name|waterway)/.test(l.id) || l.id === "pins" || l.id === "pin-labels"))
      .map((l) => ({ id: l.id, prop: (l.type === "circle" ? "circle-opacity" : l.id === "pins" ? "icon-opacity" : "text-opacity") as "circle-opacity" | "text-opacity" | "icon-opacity" }))
      .filter(({ id }) => map.getLayer(id)?.type === "circle" || map.getLayer(id)?.type === "symbol");
    for (const { id, prop } of targets) {
      const key = `${id}|${prop}`;
      if (!baseOpacity.current.has(key)) baseOpacity.current.set(key, map.getPaintProperty(id, prop) ?? 1);
      map.setPaintProperty(id, prop, (dim ? 0.4 : baseOpacity.current.get(key)) as number);
    }
    if (!timeline) eventFrame.current = null;
    // Pins that overlap at one zoom don't at another: re-spread them after each zoom.
    if (!timeline || timeline.step < 0) return;
    const redraw = () => drawSteps(map, steps, timeline.event.phases, timeline.step, { all: true });
    map.on("zoomend", redraw);
    return () => {
      map.off("zoomend", redraw);
    };
  }, [ready, timeline]);
  // Opening an event: frame ALL its places (the whole story at a glance). Then, for each new step,
  // move only if its place is out of the free part of the map (unknown places never move it).
  const framedEvent = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !shownStep || !timeline) return;
    const steps = timeline.event.steps as unknown as TimelineStep[];
    if (framedEvent.current !== timeline.event.slug) {
      framedEvent.current = timeline.event.slug;
      const all = allBounds(steps);
      if (all) return frameStep(all);
    }
    const b = stepBounds(shownStep as unknown as TimelineStep);
    if (!b) return;
    const pad = freePadding();
    const box = map.getContainer().getBoundingClientRect();
    const inView = [b[0], b[1]].every(([lng, lat]) => {
      const p = map.project([lng, lat]);
      return p.x >= pad.left && p.x <= box.width - pad.right && p.y >= pad.top && p.y <= box.height - pad.bottom;
    });
    if (!inView) frameStep(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reframe only when the step changes
  }, [ready, shownStep]);
  useEffect(() => {
    if (!timeline) framedEvent.current = null;
  }, [timeline]);

  const panelOpen = Boolean(selected || aiTarget || otd || collPanel);
  const section: MapSection = otd ? "otd" : coll || collPanel ? "collections" : "map";
  const tabBar = !panelOpen;

  /** The plain map: closes whatever panel is open. */
  function goToMap() {
    if (otd) closeOtd();
    else if (aiTarget) closeAi();
    else if (selected) router.replace("/", { scroll: false });
  }

  /** "মানচিত্র": the plain map, every pin (closes a panel and the collection). */
  function plainMap() {
    setCollPanel(false);
    goToMap();
    if (coll) closeCollection();
  }

  /** Map place names in Bangla or English (our own layers keep theirs). */
  function chooseLang(l: MapLang) {
    mapLangRef.current = l;
    setMapLangState(l);
    saveMapLang(l);
    const map = mapRef.current;
    if (!map) return;
    setMapLang(map, l, (id) => EVENT_LAYERS.includes(id) || /^(pins|pin-labels|coll-|areas-|ai-target|outside)/.test(id));
    // Our story pins: their English name in EN (the Bangla one when a story has none).
    for (const id of ["pin-labels", "coll-labels"]) if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", ["get", l === "en" ? "label_en" : "label"]);
  }


  async function nearMe() {
    if (!navigator.geolocation) return setLocError("এই ব্রাউজারে লোকেশন পাওয়া যায় না।");
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setLocating(false);
        const here = { lat: coords.latitude, lng: coords.longitude };
        setMe(here);
        const map = mapRef.current;
        if (!map) return;
        const maplibregl = await import("maplibre-gl");
        userMarker.current?.remove();
        const dot = document.createElement("div");
        dot.className = "size-4 rounded-full border-2 border-white bg-accent shadow";
        userMarker.current = new maplibregl.Marker({ element: dot }).setLngLat([here.lng, here.lat]).addTo(map);
        map.flyTo({ center: [here.lng, here.lat], zoom: 14 });
      },
      () => {
        setLocating(false);
        setLocError("লোকেশন পাওয়া যায়নি। অনুমতি দেওয়া আছে কি না দেখুন।");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // "Near me": the closest pinned stories loaded so far (the map flies there first), within 50 km.
  const nearest = me
    ? pins
        .map((p) => ({ p, d: haversine(me, p) }))
        .filter(({ d }) => d < 50_000)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
    : [];

  return (
    <div className={`map-shell relative h-dvh min-h-[420px] w-full overflow-hidden ${tabBar ? "with-tabbar" : ""}`}>
      {/* MapLibre's CSS forces position: relative on the map element, so a wrapper does the positioning. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full bg-[var(--map-ground)]" aria-label="ঐতিহাসিক স্থানের মানচিত্র" />
      </div>

      {/* The floating top bar: brand, sections, search (with near me), map language, more. Phones: search only. */}
      <div
        ref={overlayRef}
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:z-auto md:p-4 ${panelOpen ? "md:pe-[calc(var(--panel-w)+2rem)]" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <Brand />
        <SectionNav section={section} onMap={plainMap} onCollections={openCollections} onOtd={() => openOtd(null)} />
        <div className="pointer-events-auto w-full min-w-0 md:w-[360px] md:max-w-full md:flex-initial">
          <SearchBox
            leading={
              <>
                <span className="md:hidden">
                  <BrandMark />
                </span>
                <svg viewBox="0 0 20 20" className="hidden size-[18px] shrink-0 text-muted md:ms-2.5 md:block" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="m13.2 13.2 3.8 3.8" strokeLinecap="round" />
                </svg>
              </>
            }
            onPickGeo={openGeo}
            // Phones: an open story sheet steps down to its peek height, so results have room.
            onOpen={() => panelOpen && window.dispatchEvent(new CustomEvent(SHEET_REQUEST, { detail: "peek" }))}
            trailing={
              <button
                type="button"
                onClick={nearMe}
                disabled={locating}
                aria-label="আমার কাছে কী আছে"
                title="আমার কাছে"
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-accent active:bg-accent-soft-hover disabled:opacity-60 md:size-10"
              >
                {locating ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-accent-soft-hover border-t-accent" aria-hidden />
                ) : (
                  <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <circle cx="10" cy="10" r="5.5" />
                    <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
                    <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            }
          />
        </div>
        {!panelOpen && <LangSwitch lang={mapLang} onChange={chooseLang} className="pointer-events-auto hidden shadow-float md:flex" />}
        {!panelOpen && <MoreMenu />}
        </div>

        {coll ? (
          // While its panel is closed (a place is open, or the map alone). Phones: not over a sheet.
          !collPanel && (
            <div className={panelOpen ? "hidden md:block" : undefined}>
              <CollectionBar
                c={coll}
                at={collAt}
                onStep={stepCollection}
                onList={() => {
                  leavePanels();
                  setCollPanel(true);
                  window.history.replaceState(window.history.state, "", withCampaign(`/?collection=${coll.slug}`));
                }}
                onClose={closeCollection}
              />
            </div>
          )
        ) : (
          pinsShown && (
            <div className={panelOpen ? "hidden md:block" : undefined}>
              <CategoryChips kinds={pinKinds} videos={pinVideos} value={pinFilter} onChange={setPinFilter} onPanel={setKindsPanel} />
            </div>
          )
        )}

        {locError && (
          <p role="alert" className="pointer-events-auto mt-2 w-fit max-w-full rounded-control bg-card px-3 py-2 text-meta text-danger shadow-float">
            {locError}
          </p>
        )}
      </div>

      {preview && <PinPreview p={preview} />}

      {/* Hover hint over clickable labels (desktop) */}
      <div
        ref={tooltip}
        hidden
        className="pointer-events-none absolute top-0 left-0 z-10 rounded-lg bg-card px-2.5 py-1 text-meta text-ink shadow-menu"
      >
        <span className="font-semibold" /> <span className="text-accent">· বিস্তারিত →</span>
      </div>

      {/* First-visit tip: what makes this map different (above the attribution line). */}
      {showTip && !panelOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(2rem+var(--tabbar-h))] z-10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto flex max-w-md animate-[rise_.3s_var(--ease-out)] items-center gap-3 rounded-2xl bg-card p-3 ps-4 shadow-menu">
            <span className="relative flex size-2.5 shrink-0" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/50" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            <p className="flex-1 text-meta">
              <span className="font-semibold">মানচিত্রের যেকোনো নামে ট্যাপ করুন।</span>{" "}
              <span className="text-muted">এলাকা, রাস্তা, মসজিদ বা নদী: প্রতিটির পেছনের ইতিহাস জানুন।</span>
            </p>
            <button
              type="button"
              onClick={dismissTip}
              className="h-9 shrink-0 rounded-full px-3.5 text-meta font-semibold text-accent transition-colors hover:bg-accent-soft hover:text-accent-hover"
            >
              বুঝেছি
            </button>
          </div>
        </div>
      )}

      {/* Nearest places after "near me" (hidden while a story is open), above the attribution line. */}
      {!panelOpen && nearest.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(2rem+var(--tabbar-h))] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto max-w-md animate-[rise_.3s_var(--ease-out)] rounded-2xl bg-card p-2 shadow-menu">
            <p className="px-2 pt-1 pb-0.5 text-micro font-semibold tracking-wide text-muted">আপনার কাছাকাছি</p>
            <ul>
              {nearest.map(({ p, d }) => (
                <li key={`${p.name}@${p.lat},${p.lng}`}>
                  <button
                    type="button"
                    onClick={() => openAi(pinTarget(p), Math.max(mapRef.current?.getZoom() ?? 15, 15), "nearby")}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl px-2 text-start transition-colors hover:bg-hover active:bg-pressed"
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="size-2 rounded-full bg-accent"
                        aria-hidden
                      />
                      {p.label}
                    </span>
                    <span className="text-meta text-muted">{bnDistance(d)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* Wide screens: the current step's card on the map, beside its pin. */}
      {mapObj && timeline && timeline.step >= 0 && <StepPopup map={mapObj} event={timeline.event} step={timeline.step} rightInset={panelWidth()} />}
      {aiTarget && (
        <AiPanel
          target={aiTarget}
          initial={preload && preload.key === `${aiTarget.name}@${aiTarget.lat},${aiTarget.lng}` ? preload.place : undefined}
          onClose={closeAi}
          onExplore={exploreByName}
          // A story saved just now gets its page address: put it in the address bar (same history entry).
          onSlug={(slug) => {
            if (window.location.pathname !== `/place/${slug}`) window.history.replaceState(window.history.state, "", withCampaign(`/place/${slug}${window.location.hash}`));
          }}
        />
      )}
      {collPanel && (
        <CollectionsPanel
          open={coll}
          at={collAt}
          loading={collLoading}
          onPick={openCollection}
          onPlace={stepCollection}
          onBack={closeCollection}
          onClose={() => setCollPanel(false)}
        />
      )}
      {otd && (
        <OnThisDayPanel
          slug={otd.slug}
          onPick={(e) => openOtd(e.slug, e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null, { md: e.md, step: e.step })}
          onBack={() => openOtd(null)}
          onTimeline={setTimeline}
          onClose={closeOtd}
        />
      )}

      {/* Turned or tilted map: one tap puts it back north-up and flat. */}
      {turned && (
        <button
          type="button"
          onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 })}
          aria-label="মানচিত্র সোজা করুন"
          title="মানচিত্র সোজা করুন (উত্তর উপরে)"
          className="absolute start-3 bottom-[calc(6rem+var(--tabbar-h))] z-20 grid size-11 place-items-center rounded-full bg-card text-ink shadow-float transition-colors hover:text-accent md:start-4 md:bottom-28"
        >
          <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
            <path d="M12 3l4 9h-8z" fill="#c0392b" />
            <path d="M12 21l-4-9h8z" fill="currentColor" opacity=".35" />
          </svg>
        </button>
      )}

      {/* "On this day": the day's first story, bottom left (phones: above the tab bar). */}
      {!panelOpen && !showTip && nearest.length === 0 && !kindsPanel && (
        <div className="pointer-events-none absolute inset-x-3 bottom-[calc(var(--tabbar-h)+2rem)] z-10 md:inset-x-auto md:start-4 md:bottom-4">
          <OnThisDayCard
            onPick={(e) => openOtd(e.slug, e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null, { md: e.md, step: e.step })}
            onAll={() => openOtd(null)}
          />
        </div>
      )}

      {/* Wide screens, plain map: a slim footer at the bottom centre (phones: the same links are under আরও). */}
      {!panelOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden justify-center xl:flex">
          <nav aria-label="সাইট" className="pointer-events-auto flex items-center gap-3 rounded-full bg-card/95 py-1 ps-4 pe-1.5 text-micro text-muted shadow-float backdrop-blur">
            <span>© Place &amp; Past</span>
            <a href="/about" className="hover:text-ink">
              আমাদের কথা
            </a>
            <a href="/privacy" className="hover:text-ink">
              গোপনীয়তা নীতি
            </a>
            <SocialLinks size="size-4" className="-my-1" />
          </nav>
        </div>
      )}

      {/* Zoom (desktop), above the attribution line. */}
      <div className={`pointer-events-none absolute end-4 bottom-10 z-10 ${panelOpen ? "md:end-[calc(var(--panel-w)+2rem)]" : ""}`}>
        <ZoomButtons onZoom={(by) => (by > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut())} />
      </div>

      {/* First visit to the plain map: "what happened on your birthday?" (once per browser). */}
      <BirthdayPopup />

      {/* Phones: the tab bar, while nothing covers the map. */}
      {tabBar && <TabBar section={section} onMap={plainMap} onCollections={openCollections} onOtd={() => openOtd(null)} lang={mapLang} onLang={chooseLang} />}
    </div>
  );
}
