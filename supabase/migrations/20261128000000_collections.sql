-- Place & Past: collections, hand-picked sets of places in order ("UNESCO ঐতিহ্য", "১৯৭১-এর ঢাকা").
-- Run once in Supabase (after 20261127000000_story_views_daily.sql): SQL Editor → New query →
-- paste → Run. Safe to run again.
--
-- Made in the admin (Collections); visitors see published ones on the map (সংগ্রহ) and at
-- /collection/<slug>. Read and written by the server only (service key), so no public policies.

create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title_bn    text not null check (char_length(title_bn) between 1 and 120),
  title_en    text check (char_length(title_en) <= 120),
  intro_bn    text check (char_length(intro_bn) <= 2000),
  status      text not null default 'draft' check (status in ('draft', 'published')),
  -- Order in the visitors' list (smaller first), then newest.
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The places in a collection, in order, each with an optional line of its own.
create table if not exists public.collection_places (
  collection_id  uuid not null references public.collections (id) on delete cascade,
  story_id       uuid not null references public.stories (id) on delete cascade,
  position       integer not null,
  note_bn        text check (char_length(note_bn) <= 500),
  primary key (collection_id, story_id)
);

create index if not exists collection_places_order on public.collection_places (collection_id, position);
create index if not exists collection_places_story on public.collection_places (story_id);

alter table public.collections enable row level security;
alter table public.collection_places enable row level security;
