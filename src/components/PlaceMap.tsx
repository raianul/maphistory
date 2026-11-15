"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent, MapMouseEvent, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bnDistance, ERA_META, haversine } from "@/lib/format";
import { loadStyle, MIN_ZOOM } from "@/lib/map-style";
import { searchPlaces, type GeoResult } from "@/lib/geo-search";
import { AiPanel, aiShareUrl, type AiTarget } from "./AiPanel";
import { SearchBox } from "./SearchBox";
import { ERAS, type Era } from "@/lib/schema";

/** The small slice of a place the map needs (keeps the page's JS light). */
export type PinPlace = {
  slug: string;
  name: string;
  nameEn?: string;
  era: Era;
  tier: "standard" | "featured";
  summary: string;
  meta: string;
  lat: number;
  lng: number;
};

const OLD_DHAKA: [number, number] = [90.399, 23.716];
const TIP_KEY = "jg-tip-seen";

type GeoData = Parameters<GeoJSONSource["setData"]>[0];

function toGeoJSON(places: PinPlace[]): GeoData {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { slug: p.slug, name: p.name, era: p.era, featured: p.tier === "featured" },
    })),
  };
}

export function PlaceMap({ places }: { places: PinPlace[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [eras, setEras] = useState<Set<Era>>(new Set(ERAS));
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  // EXPERIMENT: a base-map place clicked for a live AI story.
  const [aiTarget, setAiTarget] = useState<AiTarget | null>(null);
  // First-visit tip: shown until the visitor opens their first story.
  const [showTip, setShowTip] = useState(false);
  const tipMarker = useRef<Marker | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => places.filter((p) => eras.has(p.era)), [places, eras]);

  // The open place comes from the URL: /place/<slug> shows its story in the side panel.
  const router = useRouter();
  const pathname = usePathname();
  const selected = pathname.match(/^\/place\/([^/]+)/)?.[1] ?? null;

  /** Moves the map so a point stays visible beside the panel (right on desktop, bottom sheet on phones). */
  function focus(lng: number, lat: number, zoom?: number) {
    const map = mapRef.current;
    if (!map) return;
    const wide = window.matchMedia("(min-width: 768px)").matches;
    map.easeTo({
      center: [lng, lat],
      zoom: zoom ?? map.getZoom(),
      offset: wide ? [-240, 0] : [0, -Math.round(window.innerHeight * 0.26)],
      duration: zoom ? 1200 : 600,
    });
  }

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

  /** Opens a curated place's story in the panel (its own URL). */
  function openPlace(p: PinPlace, zoomIn = false) {
    setAiTarget(null);
    dismissTip();
    const href = `/place/${p.slug}`;
    // Switching between places replaces history, so closing the panel returns to the map.
    if (selected) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
    focus(p.lng, p.lat, zoomIn ? Math.max(mapRef.current?.getZoom() ?? 15, 15) : undefined);
  }

  /** EXPERIMENT: opens a live AI story for any named place on the base map. */
  function openAi(target: AiTarget, zoom?: number) {
    if (selected) router.replace("/", { scroll: false });
    dismissTip();
    setAiTarget(target);
    // The address bar carries the story, so it can be shared and reopened.
    window.history.replaceState(null, "", aiShareUrl(target));
    focus(target.lng, target.lat, zoom);
  }

  function closeAi() {
    setAiTarget(null);
    window.history.replaceState(null, "", "/");
  }

  /** A search result: fly there and tell its story. */
  function openGeo(r: GeoResult) {
    openAi({ name: r.name, lat: r.lat, lng: r.lng, kind: r.kind, nearby: r.context ? [r.context] : undefined }, r.zoom);
  }

  /** A place named inside a story ("এখানে যা আছে"): find it near the current one and open it. */
  async function exploreByName(name: string) {
    const near = aiTarget ?? (mapRef.current ? { lat: mapRef.current.getCenter().lat, lng: mapRef.current.getCenter().lng } : undefined);
    const results = await searchPlaces(name, { near, limit: 3 }).catch(() => [] as GeoResult[]);
    const hit = near ? results.find((r) => haversine(near, r) < 10_000) : results[0];
    if (hit) openGeo(hit);
    else if (near) openAi({ name, lat: near.lat, lng: near.lng, nearby: aiTarget ? [aiTarget.name] : undefined });
  }

  // The map's click handler is registered once; this ref always points at the latest openPlace.
  const openRef = useRef(openPlace);
  const aiRef = useRef(openAi);
  useEffect(() => {
    openRef.current = openPlace;
    aiRef.current = openAi;
  });

  // Create the map once; maplibre-gl is loaded only on this page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [maplibregl, style] = await Promise.all([import("maplibre-gl"), loadStyle()]);
      if (cancelled || !container.current) return;
      // Copied to public/ by the predev/prebuild scripts (MapLibre 6 ships its worker separately).
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: container.current,
        style,
        center: OLD_DHAKA,
        zoom: 13.5,
        minZoom: MIN_ZOOM,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
      // Handy for debugging and browser tests in development.
      if (process.env.NODE_ENV === "development") (window as unknown as { __map: MLMap }).__map = map;

      map.on("load", () => {
        map.addSource("places", { type: "geojson", data: toGeoJSON(places) });
        const eraColor = [
          "match",
          ["get", "era"],
          ...ERAS.flatMap((e) => [e, ERA_META[e].hex]),
          "#888",
        ] as unknown as string;
        map.addLayer({
          id: "pins",
          type: "circle",
          source: "places",
          paint: {
            "circle-color": eraColor,
            "circle-radius": ["case", ["get", "featured"], 10, 7],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2.5,
          },
        });
        // Ring around the place whose story is open.
        map.addLayer({
          id: "pin-selected",
          type: "circle",
          source: "places",
          filter: ["==", ["get", "slug"], ""],
          paint: {
            "circle-radius": ["case", ["get", "featured"], 16, 13],
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#2f5bd3",
            "circle-stroke-width": 3,
          },
        });
        map.addLayer({
          id: "pin-labels",
          type: "symbol",
          source: "places",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 14,
            "text-offset": [0, 1.3],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": "#1f2328", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
        });
        map.on("click", "pins", (e: MapLayerMouseEvent) => {
          const slug = e.features?.[0]?.properties?.slug as string | undefined;
          const place = places.find((p) => p.slug === slug);
          if (place) openRef.current(place);
        });
        const labelOf = (props: Record<string, unknown> | undefined) =>
          (props?.["name:bn"] ?? props?.name) as string | undefined;
        // EXPERIMENT: any named place on the base map opens a live AI story:
        // places, points of interest, road names and rivers or lakes.
        const labelLayers = map
          .getStyle()
          .layers.filter((l) => l.type === "symbol" && /^(poi|label_|airport|highway-name|water_name|waterway)/.test(l.id))
          .map((l) => l.id);
        map.on("click", (e: MapMouseEvent) => {
          if (map.queryRenderedFeatures(e.point, { layers: ["pins"] }).length) return;
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
        map.on("mouseenter", labelLayers, () => (map.getCanvas().style.cursor = "pointer"));
        // Hover hint: the label's name and "গল্প পড়ুন", following the pointer.
        map.on("mousemove", labelLayers, (e: MapLayerMouseEvent) => {
          const tip = tooltip.current;
          const name = labelOf(e.features?.[0]?.properties);
          if (!tip || !name) return;
          tip.querySelector("span")!.textContent = name;
          tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
          tip.hidden = false;
        });
        map.on("mouseleave", labelLayers, () => {
          map.getCanvas().style.cursor = "";
          if (tooltip.current) tooltip.current.hidden = true;
        });
        map.addSource("ai-target", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "ai-target",
          type: "circle",
          source: "ai-target",
          paint: { "circle-radius": 14, "circle-color": "rgba(47,91,211,0.12)", "circle-stroke-color": "#2f5bd3", "circle-stroke-width": 2 },
        });
        map.on("mouseenter", "pins", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "pins", () => (map.getCanvas().style.cursor = ""));
        if (places.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          for (const p of places) bounds.extend([p.lng, p.lat]);
          map.fitBounds(bounds, { padding: { top: 140, bottom: 80, left: 50, right: 50 }, maxZoom: 15, duration: 0 });
        }
        setReady(true);

        // A shared AI story link (/?place=…&at=lat,lng) reopens that story.
        const params = new URLSearchParams(window.location.search);
        const at = params.get("at")?.split(",").map(Number);
        const shared = params.get("place");
        if (shared && at?.length === 2 && at.every(Number.isFinite)) {
          aiRef.current({ name: shared, lat: at[0], lng: at[1], kind: params.get("kind") ?? undefined }, 15);
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
            .find((f) => f.geometry.type === "Point" && labelOf(f.properties));
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
  }, [places]);

  // Filters and search narrow the pins on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("places") as GeoJSONSource).setData(toGeoJSON(visible));
  }, [ready, visible]);

  useEffect(() => {
    if (ready) mapRef.current?.setFilter("pin-selected", ["==", ["get", "slug"], selected ?? ""]);
  }, [ready, selected]);

  // Ring around the place the AI is writing about.
  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("ai-target") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: aiTarget
        ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [aiTarget.lng, aiTarget.lat] } }]
        : [],
    });
  }, [ready, aiTarget]);

  const panelOpen = Boolean(selected || aiTarget);

  function toggleEra(era: Era) {
    setEras((prev) => {
      const next = new Set(prev);
      if (next.has(era) && next.size > 1) next.delete(era);
      else next.add(era);
      return next;
    });
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

  const nearest = me
    ? visible
        .map((p) => ({ p, d: haversine(me, p) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
    : [];

  return (
    <div className="relative h-[calc(100dvh-57px)] min-h-[420px] w-full">
      {/* MapLibre's CSS forces position: relative on the map element, so a wrapper does the positioning. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full bg-[#f4f4f3]" aria-label="ঐতিহাসিক স্থানের মানচিত্র" />
      </div>

      {/* Search, era filters and near me */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 p-3 ${panelOpen ? "md:pe-[492px]" : ""}`}>
        <div className="pointer-events-auto mx-auto max-w-xl">
          <SearchBox
            places={places}
            onPickPlace={(p) => openPlace(p, true)}
            onPickGeo={openGeo}
            trailing={
              <button
                type="button"
                onClick={nearMe}
                disabled={locating}
                className="absolute end-1.5 top-1.5 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
              >
                {locating ? "খুঁজছি…" : "আমার কাছে"}
              </button>
            }
          />

          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="যুগ অনুযায়ী দেখুন">
            {ERAS.map((era) => {
              const on = eras.has(era);
              const { bn, hex } = ERA_META[era];
              return (
                <button
                  key={era}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleEra(era)}
                  className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-0.5 text-sm shadow-sm"
                  style={{ borderColor: on ? hex : "var(--line)", color: on ? hex : "var(--muted)" }}
                >
                  <span className="size-2 rounded-full" style={{ background: on ? hex : "var(--line)" }} />
                  {bn}
                </button>
              );
            })}
          </div>
          {locError && <p className="mt-2 rounded-lg bg-card px-3 py-1.5 text-sm text-red-800 shadow-sm">{locError}</p>}

        </div>
      </div>

      {/* Hover hint over clickable labels (desktop) */}
      <div
        ref={tooltip}
        hidden
        className="pointer-events-none absolute top-0 left-0 z-10 rounded-lg bg-ink/90 px-2.5 py-1 text-xs text-paper shadow"
      >
        <span /> · গল্প পড়ুন →
      </div>

      {/* First-visit tip: what makes this map different */}
      {showTip && !panelOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-9 z-10 p-3">
          <div className="pointer-events-auto mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-ink p-4 text-paper shadow-xl">
            <span className="mt-1 size-3 shrink-0 animate-ping rounded-full bg-accent" aria-hidden />
            <p className="flex-1 text-sm leading-relaxed">
              <span className="font-semibold">মানচিত্রের যেকোনো নামে ট্যাপ করুন।</span> এলাকা, রাস্তা, মসজিদ বা নদী: প্রতিটির পেছনের
              গল্প জানুন। উপরে খুঁজেও দেখতে পারেন।
            </p>
            <button type="button" onClick={dismissTip} className="shrink-0 rounded-full bg-paper/15 px-3 py-1 text-sm font-semibold">
              বুঝেছি
            </button>
          </div>
        </div>
      )}

      {/* Nearest places after "near me" (hidden while a story is open) */}
      {/* Sits above the map attribution line. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-7 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto mx-auto max-w-xl">
          {!panelOpen && nearest.length > 0 ? (
            <div className="rounded-2xl border border-line bg-card p-3 shadow-lg">
              <p className="px-1 text-sm text-muted">আপনার কাছাকাছি</p>
              <ul>
                {nearest.map(({ p, d }) => (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() => openPlace(p, true)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-start hover:bg-paper"
                    >
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: ERA_META[p.era].hex }} />
                        {p.name}
                      </span>
                      <span className="text-sm text-muted">{bnDistance(d)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      {aiTarget && <AiPanel target={aiTarget} onClose={closeAi} onExplore={exploreByName} />}
    </div>
  );
}
