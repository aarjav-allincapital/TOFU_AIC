-- Tracxn company profiles for sourced founders. Run once in SQL Editor.
-- key is "domain:<host>" (automatic, from the company website) or
-- "founder:<board key>" (manual "Find on Tracxn" link for stealth founders).

create table if not exists public.sourcing_tracxn (
  key         text primary key,
  domain      text not null default '',
  profile     jsonb,
  via         text not null default '',
  fetched_at  timestamptz not null default now()
);

alter table public.sourcing_tracxn enable row level security;
