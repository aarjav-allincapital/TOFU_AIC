-- Run once in Supabase SQL Editor (Project → SQL Editor → New query → Run).
-- Adds rating-module, manual-bucket, and CRM sync columns to public.deals.

alter table public.deals
  add column if not exists ai_rating_stars   integer,
  add column if not exists ai_worth          text,
  add column if not exists ai_summary        text,
  add column if not exists ai_via            text,
  add column if not exists ai_mode           text,
  add column if not exists ai_rated_at       timestamptz,
  add column if not exists manual_bucket     text,
  add column if not exists manual_bucket_at  timestamptz,
  add column if not exists manual_bucket_by  text,
  add column if not exists crm_entry_id      text,
  add column if not exists crm_synced_at     timestamptz,
  add column if not exists first_seen_at     timestamptz not null default now();

create index if not exists deals_manual_bucket_idx
  on public.deals (manual_bucket);

create index if not exists deals_crm_synced_at_idx
  on public.deals (crm_synced_at);
