-- জায়গার গল্প: saved "On this day" searches (admin only).
-- Run once in Supabase (after 20261122000000_event_research.sql): SQL Editor → New query → paste →
-- Run. Safe to run again.
--
-- The AI search for a day and country takes up to a minute and costs an AI call, and its answer
-- hardly changes, so the result is kept: the admin page shows the saved list straight away and
-- searches again only when asked ("আবার খুঁজুন"). One row per country and day; a new search
-- replaces it. Which events already exist is worked out fresh on every view, not stored.

create table if not exists public.on_this_day_searches (
  country     text not null check (country ~ '^[A-Z]{2}$'),
  month       smallint not null check (month between 1 and 12),
  day         smallint not null check (day between 1 and 31),
  -- The checked suggestions: [{ year, title_bn, summary_bn, place, category, source_url, source_quote, check }].
  candidates  jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array' and pg_column_size(candidates) < 500000),
  dropped     integer not null default 0,
  searched_by uuid references auth.users (id) on delete set null,
  searched_at timestamptz not null default now(),
  primary key (country, month, day)
);

-- Private: row level security on and no policy, so the publishable key can neither read nor write
-- it. Only the site's server (secret key, after its admin check) uses this table.
alter table public.on_this_day_searches enable row level security;
revoke all on public.on_this_day_searches from anon, authenticated;
