-- All In Capital Deal Flow — Supabase schema
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- This table mirrors the Google Sheet (the current system of record).
-- It's designed to be source-agnostic: when the source of record moves from
-- the Sheet to Attio (or anything else), only the sync job needs to change —
-- this table and the app's read path stay the same.

create table if not exists public.deals (
  row_index        integer primary key,
  date_received     text,
  date_received_ms  bigint,
  name              text not null default '',
  company           text not null default '',
  sector            text not null default '',
  website           text not null default '',
  deck_link         text not null default '',
  blurb             text not null default '',
  summary           text not null default '',
  sender_email      text not null default '',
  thread_id         text not null default '',
  action            text not null default '',
  action_date       text,
  status            text not null default '',
  linkedin          text not null default '',
  elite_school      text not null default '',
  rating            text not null default '',
  worth             text not null default '',
  owner             text not null default '',
  channel           text not null default '',
  synced_at         timestamptz not null default now()
);

create index if not exists deals_date_received_ms_idx
  on public.deals (date_received_ms desc);

create index if not exists deals_company_idx
  on public.deals (company);

create index if not exists deals_sector_idx
  on public.deals (sector);

create index if not exists deals_thread_id_idx
  on public.deals (thread_id);

-- Row Level Security — the anon key can only read. All writes go through the
-- service-role key (used only server-side by the sync job), which bypasses RLS.
alter table public.deals enable row level security;

drop policy if exists "Public read access" on public.deals;
create policy "Public read access"
  on public.deals
  for select
  to anon, authenticated
  using (true);

-- Track sync runs for observability / debugging.
create table if not exists public.sync_runs (
  id           bigint generated always as identity primary key,
  source       text not null,
  row_count    integer not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text
);

alter table public.sync_runs enable row level security;

drop policy if exists "Public read access" on public.sync_runs;
create policy "Public read access"
  on public.sync_runs
  for select
  to anon, authenticated
  using (true);

-- Portal login — one-time passcodes emailed via Resend. No public read/write
-- policies: this table is only ever touched by the service-role key from
-- server-side API routes.
create table if not exists public.login_otp_codes (
  id          bigint generated always as identity primary key,
  email       text not null,
  code_hash   text not null,
  attempts    integer not null default 0,
  consumed    boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists login_otp_codes_email_idx
  on public.login_otp_codes (email, created_at desc);

alter table public.login_otp_codes enable row level security;

-- ── Rating module + manual bucket + CRM sync tracking ──────────────────────
-- ai_* columns are only ever written by the server-side rating module (never
-- the client). They're additive to the mirrored Sheet columns above so the
-- Sheet stays the source of truth for raw deal data.
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
