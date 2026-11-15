-- জায়গার গল্প: saved place stories.
-- A visitor opens a place → its AI story is generated once, saved here and served to everyone
-- after. The admin can edit, regenerate, verify or hide it.
-- Run once in Supabase: SQL Editor → New query → paste → Run.

-- ── Stories ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  -- One story per place: "osm:<type><id>" when the map knows the OpenStreetMap object,
  -- otherwise "near:<name>@<lat>,<lng>" rounded to about 200 m.
  place_key    text not null unique,
  name_bn      text not null,
  name_en      text,
  lat          double precision not null,
  lng          double precision not null,
  kind         text,                                  -- map category, e.g. "suburb", "road or street (secondary)"
  country      text check (country in ('BD', 'IN', 'PK')),
  story        jsonb not null,                        -- the story JSON (periods, people, facts …)
  image        jsonb,                                 -- { src, credit } with licence
  model        text,                                  -- which AI model wrote it
  status       text not null default 'ai'
               check (status in ('ai', 'verified', 'hidden')),
  slug         text unique,                           -- set when verified: /place/<slug>
  views        integer not null default 0,
  reports      integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  verified_at  timestamptz,
  verified_by  uuid references auth.users (id)
);

create index if not exists stories_lat_lng on public.stories (lat, lng);
create index if not exists stories_status_views on public.stories (status, views desc);

-- Keep updated_at current on every change.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists stories_touch on public.stories;
create trigger stories_touch before update on public.stories
  for each row execute function public.touch_updated_at();

-- ── Reports from visitors ("ভুল জানান") ────────────────────────────────────────────────
create table if not exists public.story_reports (
  id          bigint generated always as identity primary key,
  story_id    uuid not null references public.stories (id) on delete cascade,
  message     text check (char_length(message) <= 1000),
  created_at  timestamptz not null default now()
);

-- ── AI generation log, for per-visitor and daily limits ────────────────────────────────
create table if not exists public.generation_log (
  id          bigint generated always as identity primary key,
  visitor     text not null,                          -- hashed IP, never the raw address
  place_key   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists generation_log_visitor_time on public.generation_log (visitor, created_at desc);
create index if not exists generation_log_time on public.generation_log (created_at desc);

-- ── Admins ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ── Access rules ────────────────────────────────────────────────────────────────────────
-- Visitors (publishable key) may only READ stories that aren't hidden. Every write goes
-- through the site's server with the secret key, after its own checks.
alter table public.stories        enable row level security;
alter table public.story_reports  enable row level security;
alter table public.generation_log enable row level security;
alter table public.admins         enable row level security;

drop policy if exists "Anyone can read visible stories" on public.stories;
create policy "Anyone can read visible stories" on public.stories
  for select using (status <> 'hidden');

-- No policies on story_reports, generation_log or admins: not readable or writable with the
-- publishable key at all.

-- ── Counters ────────────────────────────────────────────────────────────────────────────
-- Atomic +1, callable only by the server.
create or replace function public.bump_story_views(p_id uuid) returns void
language sql as $$
  update public.stories set views = views + 1 where id = p_id;
$$;

create or replace function public.add_story_report(p_id uuid, p_message text) returns void
language sql as $$
  insert into public.story_reports (story_id, message) values (p_id, p_message);
  update public.stories set reports = reports + 1 where id = p_id;
$$;

revoke execute on function public.bump_story_views(uuid) from public, anon, authenticated;
revoke execute on function public.add_story_report(uuid, text) from public, anon, authenticated;
grant  execute on function public.bump_story_views(uuid) to service_role;
grant  execute on function public.add_story_report(uuid, text) to service_role;
