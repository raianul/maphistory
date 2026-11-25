-- Ondor: opens per place per day (Bangladesh time), for the admin's "this week" numbers.
-- stories.views stays the all-time total; this table adds the day-by-day split from now on.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.story_views_daily (
  story_id uuid    not null references public.stories (id) on delete cascade,
  day      date    not null,
  views    integer not null default 0,
  primary key (story_id, day)
);
create index if not exists story_views_daily_day on public.story_views_daily (day);

-- Only the server reads and writes it (no policies: visitors can't).
alter table public.story_views_daily enable row level security;

-- One open: the total and today's count, together.
create or replace function public.bump_story_views(p_id uuid) returns void
language sql as $$
  update public.stories set views = views + 1 where id = p_id;
  insert into public.story_views_daily (story_id, day, views)
    values (p_id, (now() at time zone 'Asia/Dhaka')::date, 1)
    on conflict (story_id, day) do update set views = public.story_views_daily.views + 1;
$$;

revoke execute on function public.bump_story_views(uuid) from public, anon, authenticated;
grant  execute on function public.bump_story_views(uuid) to service_role;
