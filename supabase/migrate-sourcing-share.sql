-- Short public share cards. Run once in SQL Editor.
-- Recipients open /card/<id> without signing into TOFU.

create table if not exists public.sourcing_share_cards (
  id          text primary key,
  card        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.sourcing_share_cards enable row level security;
