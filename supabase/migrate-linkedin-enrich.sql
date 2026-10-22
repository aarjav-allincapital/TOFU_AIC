-- Run once in Supabase SQL Editor.
-- LinkedIn Bright Data enrichment (work history + college only).

alter table public.deals
  add column if not exists linkedin_work_history  text,
  add column if not exists linkedin_college       text,
  add column if not exists linkedin_enriched_at   timestamptz,
  add column if not exists linkedin_enrich_via    text;

create index if not exists deals_linkedin_enriched_at_idx
  on public.deals (linkedin_enriched_at)
  where linkedin_enriched_at is null;
