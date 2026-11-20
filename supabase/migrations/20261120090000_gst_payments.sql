-- Applied to production on 2026-11-20 (migration "gst_payments").
-- GST paid to the government, one row per return month ('YYYY-MM').
create table if not exists public.gst_payments (
  period text primary key check (period ~ '^\d{4}-\d{2}$'),
  amount numeric not null check (amount >= 0),
  paid_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.gst_payments enable row level security;

create policy authenticated_full_access_gst_payments on public.gst_payments
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.gst_payments to authenticated;
