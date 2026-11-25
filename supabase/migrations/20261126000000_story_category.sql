-- Ondor: an editor's choice of category for a place (the chips that filter the map's pins).
-- Empty (null) = worked out from the story's kind, e.g. "মসজিদ" → mosque (src/lib/categories.ts).
-- 'none' = no category. The allowed values are checked by the app, so adding a category needs no migration.
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

alter table public.stories
  add column if not exists category text;
