-- Sourced-founder LinkedIn previews (Bright Data). Run once in SQL Editor.
-- Separate from inbound deals.linkedin_* — sourcing is not on the Founders sheet.

create table if not exists public.sourcing_linkedin (
  url          text primary key,
  preview      jsonb,
  college      text,
  via          text not null default '',
  enriched_at  timestamptz not null default now()
);

alter table public.sourcing_linkedin enable row level security;
