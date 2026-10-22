-- Deal sourcing Kanban stages (New leads / Reached out / Talking). Run once in SQL Editor.
-- Keyed by LinkedIn URL or founder|company — the sourcing sheet itself is never written.

create table if not exists public.sourcing_board (
  key         text primary key,
  stage       text not null check (stage in ('new', 'reached_out', 'talking')),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.sourcing_board enable row level security;
