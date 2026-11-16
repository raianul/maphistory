-- জায়গার গল্প: historical events, Phase 3: "On this day" date matching for the public map.
-- Run once in Supabase (after 20261120000000_event_timeline.sql): SQL Editor → New query →
-- paste → Run. Safe to run again.
--
-- The rules (same as onThisDay() in src/lib/events/schema.ts, which tests them):
--   recurring, exact day       → every year on its month and day; 29 Feb shows on 28 Feb in other years
--   not recurring, exact day   → only on that very date (year, month, day)
--   month / year / approximate → never on a day

-- Whether one published event belongs on a given date.
create or replace function public.event_on_day(e public.historical_events, p_month int, p_day int, p_year int) returns boolean
language sql immutable as $$
  select e.status = 'published'
     and e.date_precision = 'day'
     and e.event_month is not null and e.event_day is not null
     and (e.recurring or e.event_year = p_year)
     and (
       (e.event_month = p_month and e.event_day = p_day)
       -- 29 February, in a year without one: on the 28th.
       or (e.event_month = 2 and e.event_day = 29 and p_month = 2 and p_day = 28
           and not ((p_year % 4 = 0 and p_year % 100 <> 0) or p_year % 400 = 0))
     );
$$;

-- The published events for a date (month, day, year), oldest first.
create or replace function public.events_on_day(p_month int, p_day int, p_year int)
returns setof public.historical_events
language sql stable as $$
  select e.* from public.historical_events e
   where e.status = 'published' and public.event_on_day(e, p_month, p_day, p_year)
   order by e.event_year nulls last, e.title;
$$;

-- The first date on or after the given one (looking up to a year ahead) that has published
-- events: returns that date, or null when there are none at all.
create or replace function public.next_event_day(p_month int, p_day int, p_year int) returns date
language plpgsql stable as $$
declare
  d date := make_date(p_year, p_month, p_day);
  i int;
begin
  if not exists (select 1 from public.historical_events where status = 'published' and date_precision = 'day') then
    return null;
  end if;
  for i in 0..366 loop
    if exists (
      select 1 from public.historical_events e
       where e.status = 'published'
         and public.event_on_day(e, extract(month from d + i)::int, extract(day from d + i)::int, extract(year from d + i)::int)
    ) then
      return d + i;
    end if;
  end loop;
  return null;
end $$;

-- Visitors may call these (they only ever see published events).
grant execute on function public.event_on_day(public.historical_events, int, int, int) to anon, authenticated, service_role;
grant execute on function public.events_on_day(int, int, int) to anon, authenticated, service_role;
grant execute on function public.next_event_day(int, int, int) to anon, authenticated, service_role;
