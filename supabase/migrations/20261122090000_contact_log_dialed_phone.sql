-- Applied to production on 2026-11-22 (migration "contact_log_dialed_phone").
-- Which number was actually dialed for a call (main number or one of the lead's alternate contacts)
alter table public.contact_log add column if not exists dialed_phone text;
create index if not exists contact_log_client_dialed_idx on public.contact_log (client_id, contacted_at desc) where dialed_phone is not null;
