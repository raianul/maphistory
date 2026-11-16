-- জায়গার গল্প: historical events, Phase 2: phases, timeline steps, and which sources back which step.
-- Run once in Supabase (after 20261119000000_historical_events.sql): SQL Editor → New query →
-- paste → Run. Safe to run again.

-- ── Phases ──────────────────────────────────────────────────────────────────────────────
-- 1–4 per event, each with a colour from the fixed brand palette (validated by the app; the
-- database checks the shape): [{ "id": "attack", "label": "হামলা", "color": "crimson" }, …]
alter table public.historical_events
  add column if not exists phases jsonb not null default '[]'::jsonb;

alter table public.historical_events drop constraint if exists historical_events_phases_shape;
alter table public.historical_events add constraint historical_events_phases_shape
  check (jsonb_typeof(phases) = 'array' and jsonb_array_length(phases) <= 4);

-- ── Timeline steps ──────────────────────────────────────────────────────────────────────
create table if not exists public.historical_event_timeline_steps (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.historical_events (id) on delete cascade,
  -- Order within the event: 0, 1, 2 … with no gaps (kept so by reorder_event_steps below; it
  -- briefly uses negative values while moving steps, so there is no "≥ 0" check here).
  position            integer not null,
  title               text not null check (char_length(title) between 1 and 200),
  narrative           text check (char_length(narrative) <= 5000),
  date_label          text check (char_length(date_label) <= 120),      -- shown: "রাত সাড়ে ১১টা নাগাদ"
  -- Minutes from the event's start, for the time slider; null when the time isn't known.
  sort_minutes        integer check (sort_minutes between -5256000 and 5256000),
  phase_id            text check (phase_id ~ '^[a-z0-9-]{1,40}$'),

  -- How it shows on the map: one place, a movement from → to, an area (circle), or text only.
  map_type            text not null default 'marker' check (map_type in ('marker', 'route', 'area', 'none')),
  -- How well the location is known. "unknown" never draws anything or moves the map.
  location_precision  text not null default 'exact' check (location_precision in ('exact', 'approximate', 'unknown')),
  place_name          text check (char_length(place_name) <= 200),     -- marker / route end / area centre
  lat                 double precision check (lat between -90 and 90),
  lng                 double precision check (lng between -180 and 180),
  from_place_name     text check (char_length(from_place_name) <= 200), -- route start
  from_lat            double precision check (from_lat between -90 and 90),
  from_lng            double precision check (from_lng between -180 and 180),
  radius_m            integer check (radius_m between 10 and 200000),   -- area: circle radius in metres

  image               jsonb,                                            -- Wikimedia Commons only, { src, credit }
  evidence            text not null default 'documented' check (evidence in ('documented', 'scholarly', 'tradition', 'disputed')),
  verified            boolean not null default false,

  created_by          uuid references auth.users (id) on delete set null,
  updated_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint historical_event_steps_coords_pair check ((lat is null) = (lng is null)),
  constraint historical_event_steps_from_pair check ((from_lat is null) = (from_lng is null)),
  -- What each map type needs (an unknown location draws nothing, so it needs no coordinates).
  constraint historical_event_steps_map_needs check (
    case
      when map_type = 'none' or location_precision = 'unknown' then true
      when map_type = 'marker' then lat is not null
      when map_type = 'route' then lat is not null and from_lat is not null
      when map_type = 'area' then lat is not null and radius_m is not null
    end
  ),
  -- Only areas have a radius; only routes have a start.
  constraint historical_event_steps_radius_only_area check (radius_m is null or map_type = 'area'),
  constraint historical_event_steps_from_only_route check (from_lat is null or map_type = 'route')
);

create unique index if not exists historical_event_steps_order on public.historical_event_timeline_steps (event_id, position);

drop trigger if exists historical_event_steps_touch on public.historical_event_timeline_steps;
create trigger historical_event_steps_touch before update on public.historical_event_timeline_steps
  for each row execute function public.touch_updated_at();

-- ── Which sources back which step ───────────────────────────────────────────────────────
-- Many-to-many, within one event: a step can only cite its own event's sources (enforced by the
-- composite foreign keys). Deleting a step or a source removes its links; reordering keeps them.
create unique index if not exists historical_event_sources_id_event on public.historical_event_sources (id, event_id);
create unique index if not exists historical_event_steps_id_event on public.historical_event_timeline_steps (id, event_id);

create table if not exists public.historical_event_step_sources (
  step_id     uuid not null,
  source_id   uuid not null,
  event_id    uuid not null,
  -- What in the source backs this step (page, passage), optional.
  note        text check (char_length(note) <= 1000),
  created_at  timestamptz not null default now(),
  primary key (step_id, source_id),
  foreign key (step_id, event_id) references public.historical_event_timeline_steps (id, event_id) on delete cascade,
  foreign key (source_id, event_id) references public.historical_event_sources (id, event_id) on delete cascade
);
create index if not exists historical_event_step_sources_source on public.historical_event_step_sources (source_id);

-- ── Reordering, all at once ─────────────────────────────────────────────────────────────
-- Sets the order of all of an event's steps in one go: the array must hold exactly that event's
-- step ids. Positions become 0..n-1 with no gaps or duplicates; source links are untouched.
create or replace function public.reorder_event_steps(p_event_id uuid, p_step_ids uuid[]) returns void
language plpgsql as $$
declare
  n_steps integer;
begin
  select count(*) into n_steps from public.historical_event_timeline_steps where event_id = p_event_id;
  if n_steps <> coalesce(array_length(p_step_ids, 1), 0)
     or n_steps <> (select count(distinct x) from unnest(p_step_ids) x)
     or exists (
       select 1 from unnest(p_step_ids) x
       where not exists (select 1 from public.historical_event_timeline_steps s where s.id = x and s.event_id = p_event_id)
     ) then
    raise exception 'reorder: the list must contain each of the event''s steps exactly once' using errcode = '22023';
  end if;
  -- Move out of the way first (negative), then into place, so the unique (event, position) index
  -- never sees two steps on one position.
  update public.historical_event_timeline_steps set position = -1 - position where event_id = p_event_id;
  update public.historical_event_timeline_steps s
     set position = o.ord - 1
    from unnest(p_step_ids) with ordinality as o(id, ord)
   where s.id = o.id and s.event_id = p_event_id;
end $$;

revoke execute on function public.reorder_event_steps(uuid, uuid[]) from public, anon, authenticated;
grant  execute on function public.reorder_event_steps(uuid, uuid[]) to service_role;

-- ── Access rules ────────────────────────────────────────────────────────────────────────
-- Visitors may read the steps (and their source links) of published events only. All writes go
-- through the server after its admin check.
alter table public.historical_event_timeline_steps enable row level security;
alter table public.historical_event_step_sources   enable row level security;

drop policy if exists "Anyone can read steps of published events" on public.historical_event_timeline_steps;
create policy "Anyone can read steps of published events" on public.historical_event_timeline_steps
  for select using (exists (select 1 from public.historical_events e where e.id = event_id and e.status = 'published'));

drop policy if exists "Anyone can read step sources of published events" on public.historical_event_step_sources;
create policy "Anyone can read step sources of published events" on public.historical_event_step_sources
  for select using (exists (select 1 from public.historical_events e where e.id = event_id and e.status = 'published'));
