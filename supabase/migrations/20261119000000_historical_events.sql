-- জায়গার গল্প: curated historical events (Phase 1: events and their sources).
-- Events are written and checked by editors in /admin/events and published by hand; nothing is
-- generated for visitors. Timeline steps, and which sources back which step, come in Phase 2.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

-- ── Events ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.historical_events (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title            text not null check (char_length(title) between 1 and 200),
  summary          text check (char_length(summary) <= 600),          -- short description for lists
  narrative        text check (char_length(narrative) <= 20000),      -- the full account
  language         text not null default 'bn' check (language ~ '^[a-z]{2}$'),

  -- When it happened. The event date is separate from the publication date (published_at).
  event_year       integer check (event_year between -5000 and 2100),
  event_month      smallint check (event_month between 1 and 12),
  event_day        smallint check (event_day between 1 and 31),
  -- day: year+month+day known · month: year+month · year: year only · approximate: a rough date
  date_precision   text not null default 'day' check (date_precision in ('day', 'month', 'year', 'approximate')),
  date_label       text check (char_length(date_label) <= 120),      -- shown as is, e.g. "আনুমানিক ১৭৫৭"
  -- Shown on "On this day" every year on its month/day (only possible with an exact day).
  recurring        boolean not null default false,
 
  -- Where (the main place; timeline steps can add more in Phase 2).
  place_name       text check (char_length(place_name) <= 200),
  city             text check (char_length(city) <= 120),
  country          text check (country is null or country ~ '^[A-Z]{2}$'),
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),

  -- A Wikimedia Commons image only (licence checked when chosen): { src, credit: {...} }.
  cover_image      jsonb,

  status           text not null default 'draft'
                   check (status in ('draft', 'research', 'review', 'published', 'archived')),
  published_at     timestamptz,                                      -- when first made public
  ai_assisted      boolean not null default false,

  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- The date fields must match their precision.
  constraint historical_events_date_matches_precision check (
    case date_precision
      when 'day' then event_year is not null and event_month is not null and event_day is not null
      when 'month' then event_year is not null and event_month is not null and event_day is null
      when 'year' then event_year is not null and event_month is null and event_day is null
      when 'approximate' then date_label is not null
    end
  ),
  -- Only an exact day can come round every year.
  constraint historical_events_recurring_needs_day check (not recurring or date_precision = 'day'),
  -- Coordinates come as a pair.
  constraint historical_events_coords_pair check ((lat is null) = (lng is null)),
  -- A published event has a publication time.
  constraint historical_events_published_at check (status <> 'published' or published_at is not null)
);

-- "On this day": published events by month/day.
create index if not exists historical_events_on_this_day
  on public.historical_events (event_month, event_day) where status = 'published';
-- Admin list: by status, most recently changed first.
create index if not exists historical_events_admin_list on public.historical_events (status, updated_at desc);

drop trigger if exists historical_events_touch on public.historical_events;
create trigger historical_events_touch before update on public.historical_events
  for each row execute function public.touch_updated_at();

-- ── Sources ─────────────────────────────────────────────────────────────────────────────
-- Belong to an event; in Phase 2 a link table connects them to the timeline steps they back.
create table if not exists public.historical_event_sources (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.historical_events (id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 300),
  url                  text check (url is null or (url ~ '^https?://' and char_length(url) <= 2000)),
  author_or_publisher  text check (char_length(author_or_publisher) <= 300),
  published_on         text check (char_length(published_on) <= 60),  -- free text: "1972", "March 2001"
  source_type          text not null default 'other'
                       check (source_type in ('book', 'archive', 'academic', 'article', 'encyclopedia', 'government', 'oral', 'other')),
  notes                text check (char_length(notes) <= 2000),
  -- Who added it: an editor, or an AI research suggestion (never trusted until verified).
  origin               text not null default 'editor' check (origin in ('editor', 'ai_suggestion')),
  verified             boolean not null default false,
  -- What the AI's claim rested on, word for word, so an editor can check it against the source.
  evidence_quote       text check (char_length(evidence_quote) <= 4000),
  position             integer not null default 0,                   -- display order
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists historical_event_sources_event on public.historical_event_sources (event_id, position);

drop trigger if exists historical_event_sources_touch on public.historical_event_sources;
create trigger historical_event_sources_touch before update on public.historical_event_sources
  for each row execute function public.touch_updated_at();

-- ── Access rules ────────────────────────────────────────────────────────────────────────
-- Visitors (publishable key) may read published events and their sources only. Every write goes
-- through the site's server with the secret key, after its admin check (no write policies here).
alter table public.historical_events        enable row level security;
alter table public.historical_event_sources enable row level security;

drop policy if exists "Anyone can read published events" on public.historical_events;
create policy "Anyone can read published events" on public.historical_events
  for select using (status = 'published');

drop policy if exists "Anyone can read sources of published events" on public.historical_event_sources;
create policy "Anyone can read sources of published events" on public.historical_event_sources
  for select using (
    exists (select 1 from public.historical_events e where e.id = event_id and e.status = 'published')
  );
