-- জায়গার গল্প: the admin chooses which stories get a pin on the public map.
-- Off by default: a story gets a pin only after the admin switches it on.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

alter table public.stories
  add column if not exists show_on_map boolean not null default false;

-- The public map loads only pinned, visible stories.
create index if not exists stories_on_map on public.stories (show_on_map) where show_on_map and status <> 'hidden';
