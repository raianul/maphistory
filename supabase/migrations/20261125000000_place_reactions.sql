-- Ondor: 👍 / 👎 on places.
-- Run once in Supabase (after 20261124000000_story_dates.sql): SQL Editor → New query → paste →
-- Run. Safe to run again.
--
-- One vote per visitor per place page (/place/<slug>), for map stories and hand-written places
-- alike. A visitor is an anonymous random id kept in a cookie (never an account, never an IP).
-- Visitors see the number of likes; the number of dislikes is for the admin only.

create table if not exists public.place_reactions (
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  visitor     text not null check (char_length(visitor) between 16 and 64),
  value       smallint not null check (value in (1, -1)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (slug, visitor)
);

-- Running totals per place, kept by the trigger below (so reading a count is one row).
create table if not exists public.place_reaction_totals (
  slug      text primary key,
  likes     integer not null default 0 check (likes >= 0),
  dislikes  integer not null default 0 check (dislikes >= 0)
);

create or replace function public.place_reactions_tally() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.place_reaction_totals
       set likes = likes - (old.value = 1)::int, dislikes = dislikes - (old.value = -1)::int
     where slug = old.slug;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.place_reaction_totals (slug, likes, dislikes)
    values (new.slug, (new.value = 1)::int, (new.value = -1)::int)
    on conflict (slug) do update
      set likes = place_reaction_totals.likes + excluded.likes,
          dislikes = place_reaction_totals.dislikes + excluded.dislikes;
  end if;
  return null;
end $$;

drop trigger if exists place_reactions_tally on public.place_reactions;
create trigger place_reactions_tally after insert or update of value or delete on public.place_reactions
  for each row execute function public.place_reactions_tally();

drop trigger if exists place_reactions_touch on public.place_reactions;
create trigger place_reactions_touch before update on public.place_reactions
  for each row execute function public.touch_updated_at();

-- Only the server reads and writes these (with the service key): no public access.
alter table public.place_reactions enable row level security;
alter table public.place_reaction_totals enable row level security;
