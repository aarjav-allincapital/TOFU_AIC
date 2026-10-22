-- Inbox attribution for per-teammate dealflow views.
-- Each triage agent (kb@, aditya@, team@) stamps the founder row it ingests
-- with an owner + channel on the shared Sheet; the sync mirrors them here.
-- Run once in the Supabase SQL editor.

alter table public.deals
  add column if not exists owner   text not null default '',
  add column if not exists channel text not null default '';

create index if not exists deals_owner_idx
  on public.deals (owner);
