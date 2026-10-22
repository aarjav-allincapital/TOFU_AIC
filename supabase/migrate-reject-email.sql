-- Pass / reject email tracking. Run once in Supabase SQL Editor.
alter table public.deals
  add column if not exists reject_email_sent_at timestamptz;

create index if not exists deals_reject_email_sent_at_idx
  on public.deals (reject_email_sent_at);
