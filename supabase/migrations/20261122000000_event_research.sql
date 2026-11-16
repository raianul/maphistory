-- জায়গার গল্প: historical events, Phase 5: AI research runs (admin only).
-- Run once in Supabase (after 20261121000000_on_this_day.sql): SQL Editor → New query → paste →
-- Run. Safe to run again.
--
-- Why a table: a research run has to survive the admin leaving the editor, and earlier runs are
-- kept to compare. Nothing in it is public. It holds what was retrieved (titles, URLs, short
-- extracts — never whole pages), the AI's validated draft, and the admin's accept/reject choices.
-- Accepting a suggestion copies it into the existing event/source/step tables as an unverified draft.

create table if not exists public.historical_event_research (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.historical_events (id) on delete cascade,
  status        text not null default 'collecting'
                check (status in ('collecting', 'analysing', 'ready', 'failed')),
  -- What the admin asked: { title, context, urls[] }.
  input         jsonb not null default '{}'::jsonb,
  -- Retrieved sources: [{ id, title, url, publisher, ..., retrieval: "retrieved" | "failed", excerpt }].
  sources       jsonb not null default '[]'::jsonb,
  -- References found inside retrieved pages but NOT retrieved themselves: research leads only.
  leads         jsonb not null default '[]'::jsonb,
  -- The AI's report after the application's checks (quotes matched, unknown ids removed …).
  draft         jsonb,
  -- The admin's choices per suggestion: { "<suggestion id>": { state: "accepted" | "rejected", at, by, target_id } }.
  decisions     jsonb not null default '{}'::jsonb,
  model         text,
  error         text check (char_length(error) <= 2000),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint historical_event_research_sizes check (
    jsonb_typeof(sources) = 'array' and jsonb_typeof(leads) = 'array' and jsonb_typeof(decisions) = 'object'
    and pg_column_size(sources) < 2000000 and pg_column_size(coalesce(draft, '{}'::jsonb)) < 2000000
  )
);

create index if not exists historical_event_research_event on public.historical_event_research (event_id, created_at desc);

drop trigger if exists historical_event_research_touch on public.historical_event_research;
create trigger historical_event_research_touch before update on public.historical_event_research
  for each row execute function public.touch_updated_at();

-- Private: row level security on, and NO policy at all, so the publishable key can neither read
-- nor write it. Only the site's server (secret key, after its admin check) uses this table.
alter table public.historical_event_research enable row level security;
revoke all on public.historical_event_research from anon, authenticated;
