-- Run once in Supabase SQL Editor.
-- Stamps when a founder replies after a Request Info email.

alter table public.deals
  add column if not exists info_replied_at   timestamptz,
  add column if not exists info_reply_note   text;

create index if not exists deals_info_replied_at_idx
  on public.deals (info_replied_at desc)
  where info_replied_at is not null;
