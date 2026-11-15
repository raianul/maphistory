-- জায়গার গল্প goes global: stories can be about any country.
-- Before: country limited to BD, IN, PK. After: any ISO 3166-1 alpha-2 code (or empty).
-- Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.

alter table public.stories drop constraint if exists stories_country_check;
alter table public.stories
  add constraint stories_country_check check (country is null or country ~ '^[A-Z]{2}$');
