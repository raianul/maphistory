# জায়গার গল্প · Jaygar Golpo

A Bangla-first map of historical places, where every pin opens the story of that place.
See `MVP Plan.md` for scope and `History Map — Project Plan.md` for the long-term plan.

## Run

```bash
pnpm install
pnpm dev      # http://localhost:3000, drafts and places in review are visible
pnpm build    # production build, published places only
```

## Stories and the admin

Any place, road or river a visitor clicks gets an AI story (Gemini), streamed into the panel and
saved in Supabase (`stories` table, see `supabase/migrations/`). Everyone after gets the saved story
instantly. New stories are limited per visitor (`AI_LIMIT_PER_HOUR`, default 10) and per day for the
whole site (`AI_LIMIT_PER_DAY`, default 300). Visitors can report mistakes ("ভুল জানান").

**Admin** (`/admin`, works on the live site):

1. Supabase → Authentication → Users → **Add user** (email + password, auto-confirm).
2. `pnpm make-admin you@example.com`
3. Log in at `/admin`: every saved story is a pin (grey = AI, gold = verified, red ring = reported,
   bigger = opened more). Click one to **verify**, **edit**, **regenerate** or **hide** it, and to read
   visitors' reports.

`/admin/content` (dev only) still edits the three places kept as files in `content/places/`, until
they move into the database.

## Adding a place by hand

Each place is a folder in `content/places/<slug>/`:

| File | Holds |
| --- | --- |
| `place.json` | Name, summary, location, era, years, tier, `status` (draft / review / published) |
| `story.json` | Ordered blocks: `stage`, `event`, `fact`, `person`, `then_now`. Each cites source ids. |
| `sources.json` | Sources with id, title, url, accessed date |
| `images/` | Image files plus `credits.json` (author, license, source URL) |

`pnpm content` checks everything against `src/lib/schema.ts`. A build fails on unknown
source ids, missing images or images without credit. Only `status: "published"` places are
built for production; set `SHOW_DRAFTS=1` to include the rest.

Review flow: drafts arrive as pull requests, get checked against their sources, and are
merged with `status: "published"`.

## Share images

Made on request, not ahead of time: `/og/place/<slug>` draws a place's 1200×630 card (its photo,
Bangla name and era line), `/og/home` the home page's. Bangla is shaped with HarfBuzz
(`src/lib/og/bangla-text.ts`), since `next/og` alone breaks conjuncts ("কেল্লা" → "কেল্‌লা").
A place with a YouTube video shares the video's thumbnail instead.

## Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The site's public address, e.g. `https://ondor.site` (no trailing slash). Every canonical URL, share link, sitemap entry and share card uses it. Unset: Vercel's production address, then `http://localhost:3000` |
| `NEXT_PUBLIC_REPORT_FORM_URL` | "Report a mistake" form; the place slug is appended |
| `NEXT_PUBLIC_BANGLADESH_ONLY` | `true` (default): only Bangladesh is shown and has stories; `false`: the whole world |

## Map data

- Base map: [OpenFreeMap](https://openfreemap.org) (OpenStreetMap data), no API key.
- Bangladesh only by default (`NEXT_PUBLIC_BANGLADESH_ONLY`): the rest of the world is blanked
  out, the map stays over Bangladesh, and clicks, search and the story API are limited to it. The
  border is Natural Earth's (public domain) plus St Martin's Island, see `src/lib/region.ts`.
  With `false`, the whole world is shown, as before.
- Labels use the Bangla name where OpenStreetMap has one, otherwise the local name. Search
  (Photon) shows Bangla names in Bangladesh and English names elsewhere.
- Location context for stories (country, region, city of a clicked point) comes from Photon's
  reverse geocoder.
