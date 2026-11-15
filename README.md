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

```bash
pnpm og                # all places
pnpm og lalbagh-fort   # one place
```

Renders `public/og/<slug>.png` with the installed Google Chrome (or `CHROME_PATH`). Commit the
PNGs. We don't use `next/og` because it breaks Bangla conjuncts ("কেল্লা" → "কেল্‌লা").

## Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL, default `https://jaygargolpo.com` |
| `NEXT_PUBLIC_REPORT_FORM_URL` | "Report a mistake" form; the place slug is appended |

## Map data

- Base map: [OpenFreeMap](https://openfreemap.org) (OpenStreetMap data), no API key.
- The whole world is shown. Labels use the Bangla name where OpenStreetMap has one, otherwise the
  local name. Search (Photon) shows Bangla names in Bangladesh and English names elsewhere.
- Location context for stories (country, region, city of a clicked point) comes from Photon's
  reverse geocoder.
