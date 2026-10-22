-- Run once in Supabase SQL Editor.
-- Portal-only pitch-deck summary fields (PDF deck agent).

alter table public.deals
  add column if not exists deck_summary         text,
  add column if not exists deck_text_excerpt    text,
  add column if not exists deck_summarized_at   timestamptz,
  add column if not exists deck_summary_via     text;

create index if not exists deals_deck_summarized_at_idx
  on public.deals (deck_summarized_at)
  where deck_summarized_at is null;
