# জায়গার গল্প: UI/UX review, current state

Findings from reading the source code (state as of 15 Nov 2026). No files other than this one were changed.
Where something cannot be determined from the code, it says so.

---

## A. Application architecture

**q: 1. What frontend framework and version does the application use?**

a: Next.js **16.4.6** (App Router) with React **19.3.0** and TypeScript 5 (`package.json`). Dev server uses Turbopack.
Cache Components is turned **off** in `next.config.ts` (the site is mostly static). Public place pages are
pre-rendered with `generateStaticParams` (`src/app/place/[slug]/page.tsx`).

**q: 2. What styling system is being used?**

a: **Tailwind CSS 4.3.3** utility classes, configured CSS-first in `src/app/globals.css` (`@import "tailwindcss"`
plus `@theme inline` tokens). A small amount of custom CSS lives in the same file: the `fadein` and `tip-pulse`
keyframes, the `.tip-ring` class, and an override for MapLibre's zoom control position. Dynamic colors (era and
period colors) are set with inline `style={{…}}`. There is **no component library** and no CSS modules.

**q: 3. What is the current overall component architecture?**

a:
- `src/app/layout.tsx` (server): global header (logo), `<main>`, and a **parallel route slot** `@panel`.
- `src/app/page.tsx` (server): loads the file-based curated places (`getPlaces()`) and renders **`PlaceMap`**.
- **`PlaceMap`** (`src/components/PlaceMap.tsx`, client, ~500 lines) owns the map and contains:
  - `SearchBox` (`src/components/SearchBox.tsx`): search (Photon) plus the near-me button;
  - the era filter chips, the hover tooltip, the first-visit tip and the "nearest places" card;
  - **`AiPanel`** (`src/components/AiPanel.tsx`): the streaming client, which renders `SidePanel` (shell) with
    **`AiStory`** (`src/components/AiStory.tsx`, layout) inside, which uses `ActionRow` and `ReportMistake`.
- Curated places (the 3 file-based ones) open through an **intercepting route**:
  - `src/app/@panel/(.)place/[slug]/page.tsx` renders `SidePanel` with `PlaceStory` (`src/components/PlaceStory.tsx`, server).
  - The same URL loaded directly renders the full page `src/app/place/[slug]/page.tsx`.
- Admin:
  - `/admin` → `AdminApp` → `AdminMap` (with `StoryPanel` and `StoryEditor`) in `src/components/admin/`;
  - `/admin/content` is the dev-only file-based editor.
- Server and data:
  - API routes: `src/app/api/ai-place/route.ts` (story stream), `src/app/api/report/route.ts`, `src/app/api/admin/*`.
  - Libraries:
    - `src/lib/ai/*`: prompt, schema, generation;
    - `src/lib/db.ts`: Supabase;
    - `src/lib/sources/*`: Commons, Wikidata, photo picking, reverse geocoding;
    - `src/lib/geo-search.ts`, `src/lib/map-style.ts`, `src/lib/partial-json.ts`, `src/lib/format.ts`.

**q: 4. Which component owns the main map?**

a: **`PlaceMap`** (`src/components/PlaceMap.tsx`). It creates the MapLibre instance once in a `useEffect`, keeps it in
`mapRef`, and registers every map event handler (pin clicks, label clicks, hover tooltip). The admin has its own
separate map in `AdminMap` (`src/components/admin/AdminMap.tsx`).

**q: 5. Which component owns the right-side story panel?**

a: The shell is **`SidePanel`** (`src/components/SidePanel.tsx`): positioning, close button, Escape key, scroll container.
The content depends on the source:
- **AI stories:** `AiPanel` (data and stream state) → `AiStory` (layout).
- **Curated places:** the `@panel` route page → `PlaceStory`.
- **Admin:** `StoryPanel` inside `AdminMap.tsx` → `AiStory` or `StoryEditor`.

**q: 6. How are the map and story panel connected? What state management mechanism is used?**

a: There is no global store (no Redux, Zustand or React Context). The mechanisms are:
- **AI stories:** local `useState` in `PlaceMap` (`aiTarget`). `AiPanel` is rendered as a child (`{aiTarget && <AiPanel …/>}`)
  and receives `target`, `onClose` (`closeAi`) and `onExplore` (`exploreByName`). The stream state lives **inside**
  `AiPanel` (`useState<View>`).
- **Curated places:** the **URL**. `PlaceMap` reads `usePathname()` (`/place/<slug>` → `selected`) and navigates with
  `router.push/replace`; the intercepting route renders the panel.
- **AI story URL:** `PlaceMap.openAi()` writes `/?place=…&at=lat,lng&kind=…` with `window.history.replaceState`. On load,
  the map `load` handler reads these parameters and reopens the story.
- **Map event handlers** are registered once, so they call the latest functions through refs (`openRef`, `aiRef`)
  updated in an effect.

**q: 7. Which map library is being used?**

a: **MapLibre GL JS 6.18.0**. The vector tiles and style are OpenFreeMap "positron" (no API key). `src/lib/map-style.ts`
(`loadStyle()`) patches the style: labels use `name:bn` with a fallback to `name`, Hind Siliguri is attached for Bangla
glyphs through MapLibre `font-faces`, and letter spacing is set to 0. MapLibre's worker is served from
`public/maplibre-gl-worker.mjs`, copied in `predev`/`prebuild`.

**q: 8. How is the selected map location represented?**

a:
- **AI stories:** an **`AiTarget`** object `{ name, lat, lng, kind?, nearby? }` (`AiPanel.tsx`): the label text, the
  coordinates (the label point, or the click point for roads and rivers), the map category, and up to 6 surrounding
  label names. On the server it becomes a `StoryTarget`, plus a `context` from reverse geocoding.
- **Curated places:** a **slug** in the URL.
- **Database:** stories are matched by **normalized name plus coordinate proximity** (see D33). The stored `place_key` is
  `near:<name>@<lat>,<lng>` rounded to a grid. The schema comment mentions `osm:<type><id>`, but **OSM IDs are not
  implemented**. No geohash is used.

---

## B. Map interaction

**q: 9. What exactly happens when a user clicks on the map?**

a: In `PlaceMap.tsx` (map `click` handler):
1. If the click hits a curated pin (`pins` layer), the pin handler runs instead: `openPlace()` → `router.push('/place/<slug>')`.
   The intercepting route then shows `SidePanel` with `PlaceStory` (static data, no AI).
2. Otherwise it queries rendered features in a **32×32 px box** (±16 px) on the label layers matching
   `^(poi|label_|airport|highway-name|water_name|waterway)`. Nothing found means nothing happens.
3. It builds the target:
   - **name:** `name:bn ?? name`;
   - **coordinates:** the label's point, or `e.lngLat` for line labels (roads, rivers);
   - **kind:** road, river or the feature class;
   - **nearby:** up to 6 other label names within ±200 px.
4. `openAi(target)`: if a curated panel is open it calls `router.replace("/")`, then `dismissTip()`, `setAiTarget(target)`,
   `history.replaceState(aiShareUrl(target))`, and `focus()` (`easeTo` with a pixel offset so the point isn't hidden by
   the panel). An `ai-target` ring is drawn on the map.
5. `AiPanel` mounts (or its `key` changes): its `useEffect` runs `fetch('POST /api/ai-place', body: target)` with an
   `AbortController`.
6. Server, `src/app/api/ai-place/route.ts`:
   1. Starts `reverseGeocode()` (Photon) and calls `findStory()` (Supabase) in parallel.
   2. **Saved story:** if it isn't hidden, sends one `done` event and calls `countView()`. Done.
   3. **Not saved:** `checkLimits()` (per-visitor hourly and site-wide daily), awaits the location context, then
      `generatePlace()` (`src/lib/ai/generate.ts`):
      - `streamStory()` (Gemini streaming JSON) runs together with `findPlacePhoto()`;
      - each text chunk is sent as `{"type":"delta"}`, and the photo as `{"type":"image"}` as soon as it's found.
   4. After the stream: the JSON is validated with `AiStoryData`, then `saveStory()` and `logGeneration()` run, and
      `{"type":"done","place"}` is sent.
7. Client: each NDJSON line is parsed. For `delta`, the accumulated text goes through `parsePartialJson()` →
   `setView({story})` → `AiStory` re-renders with the partial story. `image` sets the photo; `done` replaces the
   partial story with the final validated one (id, status, model).

**q: 10. Does the map support clicking anywhere, or only predefined markers?**

a: Neither exactly: **curated pins plus any named label** on the base map (places, POIs, road-name text, water names).
Clicking an **empty area**, a building with no label, or a **road line without its name text** does nothing.
Labels hidden at the current zoom (collision or zoom rules) can't be clicked.

**q: 11. Does the selected location's marker or map area visually change?**

a: Partly:
- **AI targets:** a translucent blue ring (`ai-target` circle layer, radius 14, `#2f5bd3`) at the target point.
- **Curated pins:** a blue ring (`pin-selected` layer).
- The clicked **label itself** isn't highlighted.
- For roads and rivers, the ring sits at the click point; the line isn't highlighted.
- **Hover (desktop):** the cursor becomes a pointer and a tooltip "নাম · গল্প পড়ুন →" follows it.

**q: 12. Can users click another location while the previous story is still generating?**

a: Yes. Nothing blocks or disables the map while a story streams.

**q: 13. What happens to the previous request if the user selects another location?**

a: `setAiTarget(newTarget)` changes `AiPanel`'s `key`, so the effect cleanup runs `ctrl.abort()` and the fetch is
cancelled. On the server, `req.signal` is passed to Gemini's `abortSignal`, which stops generation, and the route
checks `req.signal.aborted` before counting views or starting a new generation. A cancelled generation is **not
saved**. Gemini tokens already produced are still spent. Display state is keyed by `View.key`, so a late chunk from
the old request can't overwrite the new one.

**q: 14. Is there any debouncing, throttling or request cancellation?**

a:
- **Map clicks:** no debounce or throttle. Cancellation via `AbortController` (B13).
- **Search:** debounced 250 ms, with cancellation (`SearchBox.tsx`, `searchPlaces(..., { signal })`).
- **Server:** no throttling per request, but generation limits apply: `AI_LIMIT_PER_HOUR` (default 10 per visitor)
  and `AI_LIMIT_PER_DAY` (default 300 site-wide), in `src/lib/db.ts` `checkLimits()`.
- **Streaming chunks:** each one triggers a React state update; there is no frame batching or throttling.

**q: 15. Does the map preserve its zoom and position when the story panel opens?**

a:
- **Label clicks:** the zoom is kept (`focus(lng, lat)` with `zoom` undefined uses the current zoom). The center moves
  so the point sits beside the panel: offset `[-220, 0]` px on desktop, `[0, -26% of window height]` on phones.
- **Search results:** the map flies to a type-specific zoom (`GeoResult.zoom`, 12–17).
- **Curated pins:** zoom is raised to at least 15 when opened from search or the near-me list.
- **Closing the panel** doesn't restore the previous position.

---

## C. Gemini streaming

**q: 16. Which Gemini model is currently used?**

a: `GEMINI_MODEL` from the environment, or **`gemini-3.5-flash`** by default (`src/lib/ai/model.ts`). `.env.local`
has an empty `GEMINI_MODEL=`, so the default applies. The fallback is **`gemini-3.5-flash-lite`**. Thinking is set
to `ThinkingLevel.MINIMAL`.

**q: 17. Is the Gemini response generated as structured JSON or plain text?**

a: Structured JSON.

**q: 18. Is JSON streaming enabled? Which response MIME type and schema are configured?**

a: Yes. `ai.models.generateContentStream()` in `streamStory()` (`src/lib/ai/place-story.ts`) with:
- `responseMimeType: "application/json"`;
- `responseJsonSchema: RESPONSE_SCHEMA` (v2 schema, same file);
- `systemInstruction: SYSTEM_PROMPT`.

The server validates the complete text with the Zod schema `AiStoryData` after the stream ends.

**q: 19. Which backend function handles the Gemini request?**

a: `streamStory()` (async generator, `src/lib/ai/place-story.ts`), called by `generatePlace()` (`src/lib/ai/generate.ts`),
called by `POST` in `src/app/api/ai-place/route.ts`. The admin's regenerate
(`src/app/api/admin/stories/[id]/regenerate/route.ts`) calls `generatePlace()` without streaming to the browser.

**q: 20. How does the frontend receive the streamed response?**

a: **`fetch()` with a `ReadableStream`**, piped through `TextDecoderStream`. The format is **newline-delimited JSON**
(`Content-Type: application/x-ndjson`) with event objects `delta` / `image` / `done` / `error`. It is not SSE and
not WebSocket. Client code: `AiPanel` `useEffect`.

**q: 21. Is the response parsed incrementally?**

a: Yes. Each `delta` is appended to `text`, and the **whole accumulated text** is re-parsed with `parsePartialJson()`.

**q: 22. How are incomplete JSON objects handled?**

a: `src/lib/partial-json.ts` `parsePartialJson()`:
- **Closing:** it closes any open string, array or object.
- **Unfinished endings:** if the text ends mid-key, mid-number or after `:` or `,`, it steps back up to 80 characters
  until the text parses.
- **Not parseable:** it returns `undefined`, and the UI keeps the previous state.

It's tested in `tests/partial-json.test.ts`. On the server, the same parser extracts `name_en` and `photo_query_en`
early for the photo search.

**q: 23. Does the frontend display individual fields as soon as they become available?**

a: Yes, field by field and even **mid-string**: a half-written summary appears as it is typed.

**q: 24. Which story fields are streamed progressively?**

a: All of them, in the order of `RESPONSE_SCHEMA`:
1. `name_bn`, `name_en`, `photo_query_en`, `country`, `locality_en`, `kind_bn`, `historical_names`, `era_label_bn`, `origin_bn`;
2. `summary_bn`, `name_story_bn`, `historical_significance_bn`, `key_numbers`;
3. `periods` (each: label, range, years, `intro_bn`, `events`, `people`, `facts`);
4. `places_here`, `historical_debates`, `uncertain_bn`.

The photo arrives separately as an `image` event, usually early.

**q: 25. Does the UI render partial periods, events, people and facts individually?**

a: Yes. `AiStory.tsx` filters what is renderable:
- a period appears once it has a label (or old-style key) **and** `intro_bn`;
- an event once it has `title_bn`;
- a person once it has `name_bn`;
- a fact once it has `title_bn`.

Each then grows as its text streams in.

**q: 26. How are parsing errors and malformed responses handled?**

a:
- **Client:** a partial parse that fails is silently ignored (the last good state stays). A malformed NDJSON *line*
  (`JSON.parse(line)` throwing) lands in the outer `catch`, which shows the error unless the request was aborted.
- **Server:** after streaming, `AiStoryData.parse(JSON.parse(text))`.
  - If it fails, the `catch` sends `{"type":"error","message": friendlyError(e)}`.
  - `friendlyError` (`generate.ts`) translates quota and busy errors into Bangla; **other errors pass through raw**,
    e.g. Zod's English message.
  - Optional extras are lenient (`.catch(undefined)` on `evidence_level`, `era`, `historical_names`,
    `historical_debates`; the country is normalized), so a bad optional value doesn't fail the whole story.

**q: 27. What happens if the Gemini stream fails halfway through?**

a:
- **The server** sends an `error` event (unless the browser aborted). The partial story is **not saved** and nothing
  is logged.
- **The client** (`AiPanel`): if the name or summary had already appeared, it keeps the partial story and shows the
  amber error **below** it; otherwise it shows the error alone. There's no retry button; the user must click the
  place again.
- **Undetermined edge case, likely a bug:** if the connection closes without a `done` or `error` event, the read loop
  ends but `done` stays `false`, so "লিখছে…" stays visible indefinitely. Nothing in the code handles this.

**q: 28. Is there a fallback model? If so, how does fallback affect the streaming experience?**

a: Yes: `gemini-3.5-flash-lite`, tried once **only when the stream *starts*** with a 503 (busy) or 429 (quota) error
(`streamStory()`). The user just waits longer before the first words; nothing indicates the switch except
"মডেল: …" in the footer after completion. There's **no fallback mid-stream**.

**q: 29. Does the frontend re-render the entire story panel for every incoming chunk?**

a: Effectively yes. Every `delta` calls `setView` in `AiPanel`, which re-runs `AiStory` and all its children:
`PeriodSection`, the tags, the derived arrays (`periods`, `shown`, `debates`, `oldNames`). Nothing uses
`React.memo`, `useMemo` or batching. React only touches changed DOM nodes, but every component function runs
on every chunk, and the full text is re-parsed each time. `PlaceMap` is **not** re-rendered by chunks, because the
stream state is local to `AiPanel`.

**q: 30. How is the user's scroll position handled during streaming?**

a: `SidePanel` scrolls its container to the top when `title` changes (a new place). During streaming nothing adjusts
scroll; content is appended below, so a reader near the top isn't pushed. The period chip row is
`sticky top-0` inside the scroll container. Once streaming ends, periods and events are **re-sorted** by year
(`periodStart`, `sort_year`), which can shift content if the model wrote them out of order.

---

## D. Database and caching

**q: 31. Which database is used?**

a: **Supabase (PostgreSQL)** via `@supabase/supabase-js`, server-side with the secret key (`src/lib/db.ts`), and
browser-side with the publishable key only for admin login (`src/lib/supabase-browser.ts`). Separately, the 3
curated places are **JSON files in git** (`content/places/*`), compiled to `src/generated/places.json` at build time.

**q: 32. What database table stores generated stories?**

a: **`public.stories`** (`supabase/migrations/20261115000000_stories.sql`):
- Columns: `id`, `place_key` (unique), `name_bn`, `name_en`, `lat`, `lng`, `kind`, `country`, `story` (jsonb), `image`
  (jsonb), `model`, `status` (`ai` / `verified` / `hidden`), `slug`, `views`, `reports`, timestamps, `verified_at`,
  `verified_by`.
- Related tables: `story_reports`, `generation_log` (for the limits), `admins`.
- A second migration, `20261116000000_global_countries.sql`, allows any ISO country. Whether it has been run on the
  live database can't be determined from the code; `db.ts` has a fallback for when it hasn't.

**q: 33. How is a location identified when checking whether a story already exists?**

a: `findStory()` in `src/lib/db.ts`:
- `name_bn` equals the **clicked name** (NFC-normalized, trimmed, lowercased).
- `lat` and `lng` fall within a kind-dependent box (`matchRadius`):
  - about 5 km for city, town, district or state;
  - about 2 km for roads, rivers and lakes;
  - about 1 km for suburb, village or neighbourhood;
  - about 300 m for everything else.
- The nearest match wins.

**q: 34. What determines whether two map clicks refer to the same location?**

a: The same normalized name and coordinates inside that radius. Consequences:
- The same place reached under **different names** becomes separate stories. For example, searching "Lahore Fort"
  (English name outside Bangladesh) versus clicking the label "লাহোর দুর্গ".
- A point on the edge of the radius can miss.
- The `place_key` grid only guards the insert; it isn't used for lookup.

**q: 35. Is there a cache-hit/cache-miss distinction in the frontend?**

a: Not visibly. A saved story arrives as a single `done` event, so it renders complete almost at once, while a new one
streams. There's no label, indicator or different state. Both show the same AI badge, unless the story is verified.

**q: 36. Is a story saved only after the entire response is complete?**

a: Only after it's complete **and** valid **and** the photo search has finished (or a 6 s cap has passed)
(`generatePlace()` → `saveStory()`). There's no incremental saving.

**q: 37. What happens when two users request the same uncached location simultaneously?**

a: Both miss `findStory()`, so **both generate** (two Gemini calls, and two generation-log entries counted against each
visitor). The first to finish is inserted. The second's `upsert(..., { ignoreDuplicates: true })` inserts nothing,
then `saveStory()` re-reads the existing row and returns **the first user's story**. The second user watched their
own version stream, then at `done` the panel is **replaced by the other version**, so the content visibly changes.
This only happens when both requests produce the same `place_key` (same grid cell). Clicks at slightly different
points can produce two rows for one place.

**q: 38. Is there any duplicate generation prevention or request locking?**

a: No. There's only the unique `place_key` constraint at insert time. An earlier in-memory "in-flight" map was removed
when the database was introduced, so nothing remains in the current code.

**q: 39. Can an existing story be regenerated or refreshed?**

a: Yes, by an admin: `POST /api/admin/stories/[id]/regenerate` (button "আবার লিখুন" in `AdminMap`'s `StoryPanel`). It
overwrites `story`, `image` and `model`, and resets the status to `ai` unless the story is hidden. Visitors can't
regenerate; they can report ("ভুল জানান").

**q: 40. Is there any cache expiration or story versioning?**

a: There's no expiration. Each story JSON carries `schema_version` (2 for new stories, missing on old ones) and
`provenance` (method, model, `generated_at`). There's **no history of earlier versions**: regenerating or editing
overwrites the story.

---

## E. Right-side story panel

**q: 41. Is the panel an overlay above the map or a separate column?**

a: An **overlay**: `position: fixed`, `z-20` (`SidePanel.tsx`). The map keeps its full width underneath. `focus()`
offsets the center by 220 px to compensate, and the top search bar gets `md:pe-[452px]` so it doesn't sit under the
panel.

**q: 42. What is its width on desktop?**

a: **440 px** (`md:w-[440px]`), from the bottom of the 56 px header (`md:top-14`) to the bottom of the window, against
the right edge.

**q: 43. How does it behave on tablets and mobile devices?**

a:
- **Below 768 px (Tailwind `md`):** a **bottom sheet**, full width, **fixed at 62 dvh**, rounded top corners, with a
  decorative drag handle. It **cannot be dragged** or resized.
- **768 px and up (including tablets):** the 440 px desktop side panel.

There's no separate tablet layout.

**q: 44. Does it have its own scroll container?**

a: Yes: the inner `div` with `flex-1 overflow-y-auto` (`ref={scroller}`).

**q: 45. What happens when the panel opens, closes or changes location?**

a:
- **Open:** it mounts immediately with no slide or fade animation of the panel itself; the map eases to the target.
- **Close** (× or Escape):
  - **AI stories:** `closeAi()` clears `aiTarget` and resets the URL to `/` (`replaceState`).
  - **Curated places:** `router.back()`.
- **Change location:** the same `AiPanel` instance gets a new `key`: the old request is aborted, the state resets to an
  empty story, and `SidePanel` scrolls to the top (its `title` changed).
- **Curated ↔ AI:** opening an AI story while a curated panel is open replaces the route with `/`.

**q: 46. What loading states currently exist?**

a:
- **Public AI panel:**
  - before the first chunk: the header shows a colored gradient band with the clicked name, empty sections, and a
    pulsing "লিখছে…" line at the **bottom** of the content;
  - while streaming: sections appear progressively and the photo fades in;
  - when finished: the footer and the "ভুল জানান" button appear.
- **Search:** "খুঁজছি…". **Near me:** button text "খুঁজছি…".
- **Admin:** "লোড হচ্ছে…", "অনুমতি যাচাই হচ্ছে…", "AI লিখছে… (১০–২০ সে.)".
- **Curated panel:** none needed (static).

**q: 47. Does it have skeleton placeholders?**

a: **No.** The earlier skeleton (pulsing bars with step texts) was removed when streaming was introduced. Today there
are none in the public panel or the admin.

**q: 48. How are the sections currently displayed?**

a: All in `AiStory.tsx`, top to bottom:
- **Place name and location:**
  - Header: a 4:3 band with the photo (or an era-colored gradient), dark overlay, a kind chip (`kind_bn`), an era chip
    (`era_label_bn`, or `era` for old stories), an `<h1>` with `name_bn`, and `name_en · origin_bn`.
  - Photo credit line below.
  - **The location (city or country) is not shown as text.** `locality_en` is only used for the directions link.
  - Then `ActionRow` (শেয়ার / দিকনির্দেশ) and the status badge (AI-written or verified).
- **Summary:** a large paragraph (`text-lg`).
- **Origin of the name:** a tinted card "নামের গল্প", with "আগের নাম" chips from `historical_names`, plus the
  "ইতিহাসে গুরুত্ব" block (left border) when present.
- **Historical timeline:** a horizontally scrolling, sticky **period chip row** (tapping one scrolls to its section),
  then one `PeriodSection` per period: colored heading with range, the `intro_bn` paragraph, then a vertical timeline.
- **Historical events:** inside each period: a year pill on a vertical line, the title with evidence and confidence
  tags, and the body.
- **Important people:** inside each period: cards with an initial-letter avatar, name, role and body.
- **Interesting facts:** inside each period: "জানেন কি?" cards with a colored left border.
- **Nearby places:** "এখানে যা আছে" (`places_here`): tappable rows that call `exploreByName()` (Photon search near
  the current place, then a new AI story). These are places inside or along the clicked place, not nearby by distance.
- **Uncertain historical information:** an amber card "যা নিয়ে নিশ্চিত নয়", preceded by
  "ইতিহাসবিদদের মধ্যে ভিন্নমত" (debate cards with ক/খ/গ views).
- **Also:** key numbers (a horizontal row of number cards, after the name story), "ভুল জানান" (`ReportMistake`), and a
  footer legend of the tags, with the source line and the model.

**q: 49. Are these sections displayed progressively or only after the complete response?**

a: Progressively (C23–C25). Only the footer, the report button and the explore arrows on "এখানে যা আছে" wait for
completion. Periods and events are re-sorted at completion.

**q: 50. Are there any existing animations or transitions?**

a:
- **Sections and photo:** a `fadein` keyframe (0.4–0.6 s) on new sections and on the photo.
- **Header:** `transition-colors` on the hero background.
- **Indicators:** `animate-ping` on the "লিখছে…" dot and the first-visit tip; the `tip-pulse` ring on a map label.
- **Map:** MapLibre `easeTo` / `flyTo` camera animations.
- **Smooth scroll** to a period when its chip is tapped.
- **No** open or close animation on the panel itself.

---

## F. Existing visual design

**q: 51. Describe the current homepage layout.**

a:
- **Header** (`layout.tsx`, 56 px): "জায়গার গল্প" on the left and "Jaygar Golpo" on the right, inside a centered
  `max-w-3xl` box, so on wide screens both float toward the middle.
- **Below it, a full-height map** (`h-[calc(100dvh-57px)]`). Floating over the map:
  - top: the search box with the blue "আমার কাছে" (near me) button, and six **era chips**
    (প্রাচীন · সুলতানি · মুঘল · ব্রিটিশ · পাকিস্তান · বাংলাদেশ) that filter only the curated pins;
  - top right: MapLibre zoom buttons, pushed down to 7.5 rem;
  - bottom: the first-visit tip card (dark), or the "আপনার কাছাকাছি" card after near me;
  - the hover tooltip and the attribution.
- **Curated pins:** era-colored circles with Bangla labels.
- The page itself doesn't scroll.

**q: 52. What colors, typography and design tokens are used?**

a: `src/app/globals.css`:
- **Base tokens:** paper `#f7f3ec`, card `#fffdf9`, ink `#2a2118`, muted `#6b5e50`, line `#e3dacb`, accent `#2f5bd3`.
  They're exposed as Tailwind colors `paper`, `card`, `ink`, `muted`, `line`, `accent`.
- **Era colors** (CSS variables and `ERA_META` in `format.ts`): ancient `#a0522d`, sultanate `#2e7d6b`,
  mughal `#a8741a`, british `#6b5b95`, pakistan `#3f6f8a`, bangladesh `#b8324b`.
- **Period palette** (`PERIOD_PALETTE`, `format.ts`): 9 colors assigned in time order.
- **Hard-coded colors outside the tokens:**
  - map background `#f2efe9`;
  - admin statuses `#8a8178` / `#b8860b` / `#cfc6b8` / `#c0392b`;
  - Tailwind defaults `amber-*`, `emerald-*`, `red-*`, `sky-*`, `violet-*`, `stone-*` for badges and alerts.
- **Typography:** **Hind Siliguri** 400/600/700 via `next/font/google` (Bengali and Latin subsets) as `--font-hind`;
  body `line-height: 1.7`.
- Sizes and spacing are Tailwind defaults, with some arbitrary values (`text-[15px]`, `text-[11px]`, `w-[5.2rem]`).

**q: 53. Which reusable UI components already exist?**

a:
- **Shared components:** `SidePanel`, `ActionRow`, `ReportMistake`, `SearchBox`, `EraTag`, `AiStory`, `PlaceStory`, `AiPanel`.
- **File-local helpers:**
  - in `AiStory.tsx`: `Section`, `PeriodSection`, `ConfidenceTag`, `EvidenceTag`;
  - in `PlaceStory.tsx`: `Figure`, `Sources`, `Section`;
  - in `StoryEditor.tsx`: `Field`, `Item`, `AddButton`;
  - in the admin `PlaceEditor`: `IconButton`.
- **Admin:** `AdminApp`, `AdminMap`, `StoryPanel` (inside `AdminMap.tsx`), `StoryEditor`, and `PhotoPicker` / `PlaceEditor`
  for the file content.

**q: 54. Is there an existing design system?**

a: No formal one: there's no documented system and no shared primitives (`Button`, `Card`, `Badge`, `Chip`, `Sheet`).
There are consistent tokens in `globals.css` and repeated Tailwind patterns (rounded-full chips,
`rounded-2xl border-line bg-card` cards), but class strings are copied per component. Section headings are
implemented three times (`Section` in `AiStory.tsx`, `PlaceStory.tsx` and the editor).

**q: 55. Does the application support dark mode, light mode or both?**

a: **Light only.** `:root { color-scheme: light; }`, with no dark tokens or `dark:` classes.

**q: 56. Are Bangla and English typography handled consistently?**

a:
- **In the UI:** consistent. Both scripts use Hind Siliguri.
- **On the map:** inconsistent. Bangla labels use Hind Siliguri, while Latin labels use the tile server's Noto Sans.
  Outside Bangladesh, many labels show local scripts (Cyrillic, Arabic, Chinese) when OpenStreetMap has no Bangla name.
- **Mixing:** English names appear inside Bangla text (`name_en`, search results outside Bangladesh, Latin map labels),
  with no special styling.
- **Digits:** Bangla digits come from the AI or from `bnYear()`. Number formatting in the admin is mixed
  (`bnYear()` reused for counts).

**q: 57. Are there any visual inconsistencies or UX problems?**

a: Yes:
- **Discoverability:**
  - Only label *text* is clickable; empty map areas and road lines do nothing.
  - The tip appears only once per browser; mobile has no hover tooltip.
- **Global map, South Asian chrome:** the six era chips are South Asian and only affect three curated pins.
- **Header:** the logo sits in a centered 768 px box above a full-width map, and the header uses 56 px of map height.
- **Mobile:** the sheet is fixed at 62 dvh with no drag, and the search plus chips take about 230 px before the map.
- **Waiting:**
  - No skeleton, and "লিখছে…" sits at the **bottom** of the content (off-screen on phones once content starts).
  - 3–30 s before the first words, with no progress indication.
- **The location of a place isn't shown** (city or country), which matters now that the map is global.
- **Content swaps:** periods and events are re-sorted at completion, and the race in D37 can replace the whole story.
- **Two kinds of story with different layouts:** the curated `PlaceStory` (old block-based look) and the AI `AiStory`
  look different for the same kind of content.
- **Tag noise:** an item can carry both an evidence tag and a confidence tag, and the legend is only in the footer.
- **Error handling:** some errors are raw English (`String(e)`, Zod messages) and there's no retry button.
- **No panel transitions**, and the panel's close button sits apart from the handle on mobile.
- **No dark mode**, and colors are hard-coded outside the tokens (see F52).

**q: 58. Are there any existing screenshots, design references or unused components in the project?**

a:
- **Screenshots and design references:** **none in the repository.** The screenshots taken during development are in a
  temporary folder outside the project.
- **Images in the repository:** `public/og/lalbagh-fort.png` (share image) and content photos in
  `content/places/*/images` and `public/media`.
- **`doc/`** contains only this file.
- **Unused or leftover code:**
  - `public/places.geojson` is written by `buildContent()` (`src/lib/content.ts`) but nothing reads it;
  - the `t()` helper in `src/lib/places.ts` is unused;
  - the era filter chips are effectively obsolete for AI stories;
  - `/admin/content` (file-based editor) still exists alongside the database admin.

---

## G. Performance and reliability

**q: 59. What are the biggest potential performance bottlenecks?**

a:
1. **Gemini latency:** 3–30 s to the first and last token on the free tier; the fallback to Flash-Lite adds a retry.
2. **Serial steps before the first token** on a new story: `findStory()`, then `checkLimits()` (two count queries), then
   awaiting reverse geocoding (up to 2.5 s; it starts in parallel with `findStory()` but is awaited before generation).
3. **Client parsing:** the full accumulated text (about 5–10 KB) is re-parsed on every chunk, with up to 80
   step-back attempts each time, plus a full `AiStory` re-render per chunk.
4. **Photo search:** several Wikidata and Commons requests (up to 6 s cap before `done`).
5. **No HTTP caching of saved stories:** they're served by the same `POST` endpoint, so every open hits Supabase and
   increments views; nothing can be cached by a CDN.
6. **Search:** two Photon requests per query (local and English names), against a free public server with rate limits.
7. **Map start-up:** the MapLibre bundle (dynamically imported), the style JSON fetched on every mount
   (`loadStyle()`), and Hind Siliguri TTF files (about 250 KB each) for map labels.

**q: 60. Are there unnecessary React re-renders during streaming?**

a: Yes (C29). Every chunk re-renders the whole `AiStory` subtree, and all derived arrays are recomputed. Nothing is
memoized or batched per animation frame.

**q: 61. Is the map re-rendered when story content updates?**

a: No. Stream state lives in `AiPanel`, the MapLibre instance is in a ref created once, and the map layers are only
updated by effects on `visible`, `selected` and `aiTarget`, not on content.

**q: 62. How are API errors, timeouts and network interruptions presented?**

a:
- **Server-side errors:** as amber boxes, translated by `friendlyError` (quota, busy). Plus the limit messages from
  `checkLimits()` and the hidden-story message.
- **Other errors:** the raw string (`HTTP 500`, `TypeError: Failed to fetch`, Zod messages).
- **Timeouts:** there's no client-side timeout and no server-side timeout on the Gemini call. Only reverse geocoding
  (2.5 s) and the photo search (6 s cap) have limits.
- **Connection closed without a final event:** the panel stays on "লিখছে…" (C27).
- **Search failures:** "খোঁজা যায়নি, ইন্টারনেট সংযোগ দেখুন।"

**q: 63. Does the application have loading, empty, error and completed states?**

a:
- **Loading:** partial only (no skeleton); "লিখছে…".
- **Empty:**
  - search "কিছু পাওয়া যায়নি।" / "নাম লিখে খুঁজুন";
  - admin list "এখনো কোনো গল্প সংরক্ষিত হয়নি…";
  - **no state for "this place has little known history"** beyond the AI's own `uncertain_bn`.
- **Error:** an amber box, with or without a partial story.
- **Completed:** the footer, the report button, and active "এখানে যা আছে" links.

**q: 64. Are there existing tests for map interaction, streaming and caching?**

a:
- **Present:** Vitest, 25 tests:
  - `tests/story-schema.test.ts`: v1/v2 schema compatibility using real saved stories, period display, the prompt;
  - `tests/partial-json.test.ts`: the streaming parser.
- **Missing:**
  - map interaction (`PlaceMap`);
  - the `/api/ai-place` route (NDJSON events, aborts, limits);
  - database caching (`findStory`, `saveStory`, the race in D37);
  - components (`AiStory` rendering partial states).
- The browser tests run during development were ad-hoc scripts outside the repository.

---

## H. Recommendations

### 1. Current architecture in short

A Next.js 16 app whose home page is one large client component, `PlaceMap` (MapLibre).
- **Story request:** clicking a named label creates an `AiTarget`; `AiPanel` posts it to `/api/ai-place`.
- **Saved story:** returned from Supabase in one event.
- **New story:** Gemini streams schema-constrained JSON; the server forwards the chunks as NDJSON, finds a Commons photo
  in parallel, validates, saves, and sends the final version. The browser re-parses the partial JSON on every chunk
  and renders `AiStory` progressively inside the fixed `SidePanel` overlay.
- **Curated places:** separate, file-based, routed through an intercepting `@panel` route.
- **Admin:** a second map over the same `stories` table, behind Supabase Auth.
- **State:** component state plus the URL; there's no global store.

### 2. Current user journey

1. The visitor lands on the map (Old Dhaka). The first time, a tip says "tap any name".
2. They tap a label, or search for a place.
3. A ring marks the spot. The map shifts. The panel appears with the clicked name on a colored band.
4. After 3–30 s, text starts streaming. The photo usually arrives first; then the summary, name story, period chips and
   period sections appear in order.
5. When it finishes: share and directions buttons, report a mistake, and tappable "এখানে যা আছে" places.
6. Another tap aborts the current story and starts the next. Closing returns to the map at the shifted position.
7. A previously opened place opens instantly from the database, looking exactly the same.

### 3. The five most important UI/UX problems

1. **The wait is unshaped:** no skeleton, the "লিখছে…" indicator sits at the bottom, nothing to read for up to 30 s,
   a reorder at the end, and a possible endless "লিখছে…" if the connection drops.
2. **The interaction model is hard to discover and narrow:** only label text is clickable, nothing happens on empty
   areas or road lines, there's no mobile hint after the first visit, and the selected place isn't clearly named on
   the map.
3. **The mobile sheet is rigid:** fixed at 62 dvh, can't be dragged or peeked, and with the header, search and era chips
   the map is small. Closing loses context.
4. **Trust and identity aren't clear enough:**
   - no visible location (city or country) for the place;
   - no difference between a saved and a new story;
   - a story can be swapped on completion (D37);
   - the same place under two names gives two stories;
   - two tags per item is noisy.
5. **The chrome is stale and inconsistent for a global product:** South Asian era chips, a centered header over a
   full-width map, two different story layouts (`PlaceStory` vs `AiStory`), no shared primitives, no panel transitions,
   raw English errors, and no retry.

### 4. The five most valuable improvements

1. **Designed streaming states:** a section-shaped skeleton that fills in place, a progress line at the **top** of
   the panel ("লেখা হচ্ছে · ২/৫ আমল"), no reordering once shown, a timeout and "stream ended" detection, and a
   **retry** button.
2. **A real panel shell:** a draggable bottom sheet with three snap points (peek, half, full) on phones; on desktop
   the side panel gets a compact sticky header (name, location, period chips, actions) and open/close transitions.
   The map stays interactive in the peek position.
3. **Tap anywhere:** an empty-area or road-line tap resolves to the nearest named place (reverse geocoding is already
   on the server). Clear selection feedback: a marker with the place name, and highlighting of the label or road.
4. **One story layout and clear status:** `AiStory` becomes the only layout (curated places converted to the same
   format). Each story shows the place's location under the name and one status line (verified / AI / new). Tags are
   merged into one chip per item, with an explanation on tap.
5. **Global, map-first chrome:** the header folds into a floating search bar, the South Asian era chips are removed or
   replaced by a time filter that works globally, and "জনপ্রিয়" / "আশেপাশে" suggestions replace the empty state.

### 5. Proposed desktop layout

```
┌──────────────────────────────────────────────────────────────┬──────────────────────────┐
│ [◉ জায়গার গল্প] [🔍 যেকোনো জায়গা খুঁজুন…        ] [◎]       │ ┌──────────────────────┐ │
│                                                              │ │ লালবাগ কেল্লা       × │ │ ← sticky mini header
│                                                              │ │ ঢাকা, বাংলাদেশ · দুর্গ  │ │   (name, location, kind)
│                        MAP (full height)                     │ │ [শেয়ার] [দিকনির্দেশ]   │ │
│                                                              │ │ ● মুঘল ● ব্রিটিশ ● …   │ │ ← period chips
│               ◉ selected place (named marker)                │ ├──────────────────────┤ │
│                                                              │ │  photo 16:9          │ │
│                                                              │ │  summary             │ │
│                                                              │ │  নামের গল্প            │ │
│                                                              │ │  periods …           │ │  480 px, own scroll,
│ [ + − ]                                     attribution      │ │  এখানে যা আছে          │ │  slides in/out
└──────────────────────────────────────────────────────────────┴──────────────────────────┘
```
- No separate header row. The map fills the window, and the panel is an overlay that slides in from the right.
- The status line (AI / verified / being written) sits under the mini header.

### 6. Proposed mobile layout

```
┌───────────────────────┐      ┌───────────────────────┐      ┌───────────────────────┐
│ [◉][🔍 খুঁজুন…  ][◎]   │      │ [◉][🔍 খুঁজুন…  ][◎]   │      │ ═══                 × │
│                       │      │                       │      │ লালবাগ কেল্লা          │
│        MAP            │      │        MAP            │      │ ঢাকা · দুর্গ · মুঘল    │
│                       │      │   ◉ selected          │      │ ● মুঘল ● ব্রিটিশ …     │
│   ◉ selected          │      ├───────────────────────┤      ├───────────────────────┤
│                       │      │ ═══                   │      │ photo                 │
├───────────────────────┤      │ লালবাগ কেল্লা          │      │ summary …             │
│ ═══ লালবাগ কেল্লা  ›   │      │ ঢাকা · দুর্গ           │      │ periods …             │
│ ঢাকা · লেখা হচ্ছে…     │      │ photo · summary …     │      │                       │
└───────────────────────┘      └───────────────────────┘      └───────────────────────┘
   PEEK (~20%)                    HALF (~55%)                    FULL (reading)
```
- The sheet opens in **half** after a tap, and swipes between peek, half and full; swiping down from peek closes it.
- In peek the map stays usable, so the next place can be tapped directly.
- The search bar stays at the top; filters are behind an icon.

### 7. Proposed progressive streaming experience

| Time | What the user sees |
| --- | --- |
| 0 s (tap) | The marker appears with the name; the sheet or panel opens instantly with the name, the location (from reverse geocoding, sent to the client as a first event), and a skeleton shaped like the story (photo, 2 summary lines, 3 period chips) |
| about 1 s | The photo fades into its reserved space; the progress line at the top reads "ইতিহাস লেখা হচ্ছে…" |
| first words | The summary types in place of its skeleton lines; the kind and era chips appear |
| periods | Each period's chip turns from grey to colored as its section starts; the progress line reads "৩টি আমলের ২য়টি…" |
| done | The progress line becomes the status ("✦ AI · এখনো যাচাই হয়নি" or "✓ যাচাই করা"); the actions and "এখানে যা আছে" links activate; **nothing moves** |
| error mid-stream | The partial content stays, with an inline banner "পুরোটা লেখা যায়নি" and a **আবার চেষ্টা** (try again) button |
| saved story | The same layout appears complete at once, with a subtle "সংরক্ষিত গল্প" (saved story) note, so cache hits feel instant |

Details:
- The skeleton reserves height for the photo and summary, so nothing jumps.
- Content is never re-sorted after it has been shown: the prompt already asks for chronological order, and any sorting
  happens on the server before `done`.
- Chunks are rendered at most once per animation frame.
- "লিখছে…" moves from the bottom to the top.

### 8. Existing components to reuse

- `AiStory`: the section components (`PeriodSection`, `EvidenceTag`, `ConfidenceTag`), the period chips, the
  "এখানে যা আছে" exploration, the name story and debates. It's the best layout in the app and should become the only one.
- `ActionRow` (share, directions), `ReportMistake`, `SearchBox` (keyboard handling, recent searches, two-language
  results).
- `AiPanel`'s streaming loop, `parsePartialJson`, and `periodDisplay` / `periodStart`.
- `map-style.ts` (`loadStyle`) and `PlaceMap`'s click resolution (label query, kind, nearby labels) and `focus()` offset logic.
- `AdminMap`, `StoryPanel` and `StoryEditor` for the admin, which is outside this redesign's scope.

### 9. Components that need improvement or replacement

- **`SidePanel`:** replace with a responsive sheet (draggable snap points on mobile, a transitioning side panel on
  desktop, a sticky compact header, close and handle together).
- **`AiPanel`:** add the skeleton, a top progress line, a retry action, a timeout and "stream ended" handling, and
  frame-batched updates. It should also distinguish saved from new stories.
- **`AiStory`:** show the location under the name; don't re-sort after showing; use one tag per item with an
  explanation; memoize sections.
- **`PlaceStory`:** retire it in favor of `AiStory`, after converting the curated places to the story format.
- **`PlaceMap`:** split into map, overlays (search, tip, tooltip, nearest) and selection logic; remove or replace the
  era chips; tap-anywhere resolution; a named selection marker.
- **`layout.tsx` header:** fold it into the floating search bar on the map page.
- **New shared primitives:** `Chip`, `Badge`, `Card`, `Button`, `SectionHeading`, `Sheet`, replacing the copied class
  strings, plus a short token and usage note to serve as a minimal design system.

### 10. Architectural changes, separate from purely visual ones

**Architectural (need code or data changes beyond styling):**
1. **Generation lock and deduplication:** mark a place as "being generated" (for example a `stories` row with
   `status = 'generating'`, or a short-lived lock keyed by the place) so simultaneous visitors share one generation
   and never see a story swapped on completion (D37–D38).
2. **Better place identity:** use OSM IDs when available (map features and Photon results carry them) and store
   name aliases, so "Lahore Fort" and "লাহোর দুর্গ" resolve to one story (D34).
3. **Separate read and write endpoints:** a cacheable `GET` for saved stories (CDN or edge cache, view counts batched
   or asynchronous) apart from the streaming `POST` for new ones.
4. **More stream events and robustness:**
   - an early `context` event (location and kind) so the panel can show the location at once;
   - an explicit `stage` / `progress` event;
   - a final `end` marker the client requires;
   - structured error codes instead of strings;
   - client and server timeouts.
5. **Rendering efficiency:** batch chunk updates per animation frame; parse incrementally or only on boundaries;
   memoize period sections.
6. **Tap-anywhere:** a route or client path that turns an unlabeled tap into the nearest named feature
   (reverse geocoding already exists on the server).
7. **Unify curated and AI stories:** move the 3 file-based places into `stories` in the v2 format and retire
   `PlaceStory` and the `@panel` file path (keeping SEO pages for verified stories).
8. **Story history:** keep earlier versions on regenerate or edit (small storage cost, see the earlier estimate).
9. **Tests:** the API route (events, aborts, limits, race), `findStory` / `saveStory`, and `AiStory` partial rendering.

**Purely visual (no data or API change):**
- **Layout:** the floating search bar instead of the header row, a wider desktop panel (480 px), and a 16:9 photo on mobile.
- **Panel states:** the sheet with snap points, panel transitions, a skeleton matching the layout, and the progress
  line moved to the top.
- **Content and labels:**
  - the location line under the name;
  - one tag per item with a tap-to-explain legend;
  - Bangla error texts;
  - removing the era chips;
  - a named selection marker style.
- **Tokens and theme:** shared primitives and token cleanup (move hard-coded colors into tokens), and optionally a
  dark theme.
