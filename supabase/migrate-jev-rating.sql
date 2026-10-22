-- Parallel Jev rating columns. Does not replace ai_* and never drives auto-pass.
-- Run once in Supabase SQL Editor.

alter table public.deals
  add column if not exists jev_rating_stars integer,
  add column if not exists jev_worth        text,
  add column if not exists jev_summary      text,
  add column if not exists jev_via          text,
  add column if not exists jev_rated_at     timestamptz;

-- Rows whose AI column was overwritten by the Jev experiment: copy into jev_*.
update public.deals
set
  jev_rating_stars = ai_rating_stars,
  jev_worth        = ai_worth,
  jev_summary      = ai_summary,
  jev_via          = ai_via,
  jev_rated_at     = ai_rated_at
where ai_via ilike '%jev%'
  and jev_rating_stars is null;
