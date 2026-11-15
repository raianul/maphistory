# History Map — Lean MVP Plan

Nov 13, 2026 · @Raian

## Goal

Ship a fast, Bangla-first website for Dhaka's historical places within about 6 weeks. Then find out whether people discover and share the place pages (Gate 1).

The place page is the product, and the map is how people browse. There's no database, no CMS, and no login.

## Scope

**In**

- [ ] Map of Dhaka with era-colored pins, era filters, search, "near me" and a preview card
- [ ] 3 featured places with the full visual story: construction stages, timeline, then-and-now, people
- [ ] About 30 standard places with a timeline, key facts, photos and sources
- [ ] Bangla UI (Hind Siliguri); English text shown where it exists
- [ ] One URL per place, sitemap, Open Graph share image per place
- [ ] Share button (Web Share API, with copy link as a fallback)
- [ ] "Report a mistake" link on every page
- [ ] Analytics: page views, pin taps, shares, where visitors came from

**Out:** login, want/visited/favorite marks, passport, GPS check-in, story cards, audio, English UI, places outside Dhaka, offline support beyond the defaults.

Featured places: Lalbagh Fort, Ahsan Manzil, Star Mosque (see Decisions).

## Stack

| Part | Choice | Notes |
| --- | --- | --- |
| Site | Next.js (App Router), fully static | Every place page is built ahead of time |
| Content | JSON + Markdown files in the git repo | Same shape as the future `landmarks` and `story_blocks` tables, so moving to Supabase later is a script |
| Map | MapLibre GL JS + OpenFreeMap tiles | Free, no API key, commercial use allowed. Bangla labels drawn with Hind Siliguri. Loaded only on the map page |
| Pins | `places.geojson` generated at build | Search, filters and "near me" all run in the browser |
| Images | Copied from Wikimedia Commons into the repo, served via `next/image` | License and credit stored with each image |
| Hosting | Vercel | Hobby is fine while the site has no ads or income |
| Analytics | Umami Cloud or Plausible | Custom events for pin taps and shares |
| Reports | A Tally or Google Form, with the place slug filled in | No backend needed |

## Content model

```
content/places/lalbagh-fort/
  place.json      # slug, name_bn, name_en, lat, lng, era, built_start, built_end, tier, status
  story.json      # ordered blocks: kind (stage/event/fact/person/then_now), year, title_bn, body_bn, media, source
  sources.json    # title, url, accessed_at
  images/         # files plus credits.json (author, license, source_url)
```

Only places with `status: "published"` are built. Drafts and places in review stay in the repo without being built.

## Content workflow

1. **Collect.** A script pulls facts, Wikipedia text (Bangla and English) and Commons images for a list of place slugs.
2. **Draft.** An AI step writes `story.json` in Bangla, with a source URL on every block.
3. **Review.** Each place arrives as a pull request. You check it against the sources, fix it, and merge with `status: "published"`.
4. **Publish.** The merge triggers a Vercel deploy, which updates the page and the sitemap.

## Milestones

| Week | Deliverable |
| --- | --- |
| 1 | Next.js setup, content schema, Bangla font, base layout. Spike: Bangla text in OG images (see risks). |
| 2 | Map page: pins, era filters, search, near me, preview card |
| 3 | Place page template for the standard tier; collect-and-draft script; first 10 standard places reviewed |
| 4 | Featured-place components (construction stages, then-and-now slider); Lalbagh Fort complete |
| 5 | Ahsan Manzil and Star Mosque; standard places up to about 30; OG images, sitemap, share, report form |
| 6 | Speed pass on a mid-range Android phone over 4G, analytics events, domain, launch |

## Launch

- Post 2–3 featured places as visual posts with links in Bangladeshi history, heritage and travel Facebook groups
- Submit the sitemap to Google Search Console
- Track for 8 weeks before deciding on Gate 1

**Gate 1 (suggested, adjust after month 1):** about 1,000 visitors per month by week 8, at least 30% of them arriving from search or shared links, and featured pages reaching at least 50% scroll depth.

## Risks

| Risk | Mitigation |
| --- | --- |
| ~~OG images break Bangla~~ Confirmed in week 1: `next/og` breaks conjuncts | Solved: `pnpm og` renders share images with Chrome; PNGs are committed |
| Stage drawings take longer than planned | SVG line drawings in code instead of hand art; annotated photos where a drawing isn't ready |
| AI drafts contain wrong facts | Nothing merges unreviewed; every block has a source; report form on every page |
| Slow pages on mobile data | No map JS on place pages, only the font weights in use, optimized images, check against a performance budget |
| Vercel Hobby is non-commercial; OpenFreeMap is a free community service with no uptime guarantee | Fine until there is income. MapLibre keeps tiles swappable (self-hosted Protomaps or MapTiler) |

## Decisions (made Nov 13, 2026)

**1. Name: Jaygar Golpo (জায়গার গল্প, "the story of a place")**
- It says what the product does (every pin opens a place's story), it's easy to say in Bangla, and it works as a brand in English.
- Domain: `jaygargolpo.com`. It was unregistered when checked on Nov 13, 2026, so register it soon. Fallback: `itihashmap.com` (also free then).

**2. Featured places: Lalbagh Fort, Ahsan Manzil, Star Mosque**
- **Lalbagh Fort:** started in 1678 and never finished after Pari Bibi's death, a strong "what was planned versus what was built" story.
- **Ahsan Manzil:** built 1859–1872, rebuilt after the 1888 tornado, with clear before/after stages.
- **Star Mosque:** an early 18th-century mosque, redecorated in the 1920s with Japanese and English china tiles, with a visible change in look.
- All three are within about 3 km in Old Dhaka, so one photo walk covers them, and they're Dhaka's most-shared heritage sites.

**3. Illustrations: no hand-drawn art for the MVP**
- Construction stages are simple SVG line drawings built in code, one consistent style, each stage adding to the last. Annotated photos and plans fill gaps.
- Hand-drawn art can replace them later if featured pages prove popular. This removes the biggest schedule risk.

**Still open:** who reviews content besides you (not needed for launch).
