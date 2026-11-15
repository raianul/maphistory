-- জায়গার গল্প: historical videos for places.
-- A place is a row in `stories` (one row per place on the map), so videos reference stories(id).
-- Video metadata is kept separate from the AI-generated story JSON.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

create table if not exists public.place_videos (
  id                uuid primary key default gen_random_uuid(),
  story_id          uuid not null references public.stories (id) on delete cascade,
  -- Provider + its own video id, e.g. ('youtube', 'jNQXAC9IVRw'). Only YouTube for now.
  video_provider    text not null default 'youtube' check (video_provider in ('youtube')),
  provider_video_id text not null,
  video_url         text not null,                    -- canonical watch URL
  video_title       text not null,                    -- as published (from the provider, not invented)
  language          text not null default 'bn',       -- ISO 639-1: bn, en, …
  duration_seconds  integer check (duration_seconds is null or duration_seconds > 0),
  thumbnail_url     text,
  published_at      timestamptz,
  sort_order        integer not null default 0,       -- lowest first; the first is the main video
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (story_id, video_provider, provider_video_id)
);

create index if not exists place_videos_story on public.place_videos (story_id, sort_order);

drop trigger if exists place_videos_touch on public.place_videos;
create trigger place_videos_touch before update on public.place_videos
  for each row execute function public.touch_updated_at();

-- Visitors may read videos of visible stories; every write goes through the server (admin).
alter table public.place_videos enable row level security;

drop policy if exists "Anyone can read videos of visible stories" on public.place_videos;
create policy "Anyone can read videos of visible stories" on public.place_videos
  for select using (
    exists (select 1 from public.stories s where s.id = story_id and s.status <> 'hidden')
  );
