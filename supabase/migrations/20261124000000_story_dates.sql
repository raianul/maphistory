-- Ondor: stories with several "On this day" dates.
-- Run once in Supabase (after 20261123000000_on_this_day_searches.sql): SQL Editor → New query →
-- paste → Run. Safe to run again.
--
-- A story (historical_events) is about a PERSON (a life: birth → … → death) or an EVENT (one
-- happening and how it unfolded). It can appear on "On this day" on several dates, each with its
-- own title: Colonel Taher's story on 24 Nov ("arrested") and 21 Jul ("hanged"); Rabindranath's on
-- his birth, his Nobel Prize and his death. One story, written once, several anniversaries.
-- Dates are Gregorian (English calendar) only.

-- ── Stories: person or event, and their Wikidata identity ─────────────────────────────────
alter table public.historical_events
  add column if not exists kind text not null default 'event' check (kind in ('person', 'event'));
-- The subject's Wikidata item (e.g. Q7241 for Rabindranath): the same person or event is found
-- again whatever the title says, so it is never written twice.
alter table public.historical_events
  add column if not exists wikidata_id text check (wikidata_id ~ '^Q[0-9]{1,12}$');
create unique index if not exists historical_events_wikidata on public.historical_events (wikidata_id) where wikidata_id is not null;

-- ── Timeline steps: their exact date, when known ──────────────────────────────────────────
-- Besides the free-text date_label ("ভোররাতে", "১৯৭০-৭১"): numbers, so a step with an exact day
-- can become an anniversary. Year alone, year+month, or a full real date.
alter table public.historical_event_timeline_steps add column if not exists step_year integer check (step_year between -5000 and 2100);
alter table public.historical_event_timeline_steps add column if not exists step_month smallint check (step_month between 1 and 12);
alter table public.historical_event_timeline_steps add column if not exists step_day smallint check (step_day between 1 and 31);
alter table public.historical_event_timeline_steps drop constraint if exists historical_event_steps_date_parts;
alter table public.historical_event_timeline_steps add constraint historical_event_steps_date_parts check (
  (step_month is null or step_year is not null) and (step_day is null or step_month is not null)
);

-- ── Anniversaries: the dates a story appears on, each with its own title ────────────────────
create table if not exists public.historical_event_dates (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.historical_events (id) on delete cascade,
  -- The step the story opens at on this date (null: the first step). Removing the step keeps the date.
  step_id     uuid,
  year        integer not null check (year between 1 and 2100),
  month       smallint not null check (month between 1 and 12),
  day         smallint not null check (day between 1 and 31),
  -- That day's headline and line for the list, e.g. "কর্নেল তাহেরের ফাঁসি".
  title       text not null check (char_length(title) between 1 and 200),
  summary     text check (char_length(summary) <= 600),
  -- Shown to visitors only when 'published' AND the story itself is published.
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint historical_event_dates_real check (make_date(year, month, day) is not null),
  constraint historical_event_dates_once unique (event_id, year, month, day),
  foreign key (step_id, event_id) references public.historical_event_timeline_steps (id, event_id) on delete set null (step_id)
);
create index if not exists historical_event_dates_day on public.historical_event_dates (month, day);

drop trigger if exists historical_event_dates_touch on public.historical_event_dates;
create trigger historical_event_dates_touch before update on public.historical_event_dates
  for each row execute function public.touch_updated_at();

-- Visitors may read published dates of published stories; every write goes through the server.
alter table public.historical_event_dates enable row level security;
drop policy if exists "Anyone can read published dates of published stories" on public.historical_event_dates;
create policy "Anyone can read published dates of published stories" on public.historical_event_dates
  for select using (
    status = 'published' and exists (select 1 from public.historical_events e where e.id = event_id and e.status = 'published')
  );

-- Every existing story with an exact day gets that day as its first anniversary: shown every year
-- if it was before (recurring and published), otherwise kept as a draft for the admin to approve.
insert into public.historical_event_dates (event_id, year, month, day, title, summary, status, created_by)
select e.id, e.event_year, e.event_month, e.event_day, e.title, e.summary,
       case when e.recurring and e.status = 'published' then 'published' else 'draft' end, e.created_by
  from public.historical_events e
 where e.date_precision = 'day' and e.event_year between 1 and 2100 and e.event_month is not null and e.event_day is not null
on conflict (event_id, year, month, day) do nothing;

-- ── "On this day" from anniversaries ──────────────────────────────────────────────────────
-- The published anniversaries of published stories for a date; 29 February shows on 28 February
-- in years without one. Oldest first.
create or replace function public.anniversaries_on_day(p_month int, p_day int, p_year int)
returns table (
  date_id uuid, event_id uuid, slug text, story_title text, kind text, title text, summary text, year int,
  step_id uuid, place_name text, city text, lat double precision, lng double precision, cover_image jsonb
)
language sql stable as $$
  select d.id, e.id, e.slug, e.title, e.kind, d.title, coalesce(d.summary, e.summary), d.year,
         d.step_id, e.place_name, e.city, e.lat, e.lng, e.cover_image
    from public.historical_event_dates d
    join public.historical_events e on e.id = d.event_id
   where d.status = 'published' and e.status = 'published'
     and (
       (d.month = p_month and d.day = p_day)
       or (d.month = 2 and d.day = 29 and p_month = 2 and p_day = 28
           and not ((p_year % 4 = 0 and p_year % 100 <> 0) or p_year % 400 = 0))
     )
   order by d.year, d.title;
$$;

-- The first date on or after the given one (up to a year ahead) with published anniversaries.
create or replace function public.next_anniversary_day(p_month int, p_day int, p_year int) returns date
language plpgsql stable as $$
declare
  d date := make_date(p_year, p_month, p_day);
  i int;
begin
  if not exists (
    select 1 from public.historical_event_dates x join public.historical_events e on e.id = x.event_id
     where x.status = 'published' and e.status = 'published'
  ) then
    return null;
  end if;
  for i in 0..366 loop
    if exists (select 1 from public.anniversaries_on_day(extract(month from d + i)::int, extract(day from d + i)::int, extract(year from d + i)::int)) then
      return d + i;
    end if;
  end loop;
  return null;
end $$;

grant execute on function public.anniversaries_on_day(int, int, int) to anon, authenticated, service_role;
grant execute on function public.next_anniversary_day(int, int, int) to anon, authenticated, service_role;
