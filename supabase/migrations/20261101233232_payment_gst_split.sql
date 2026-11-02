-- Applied to production on 2026-11-01 (migration "payment_gst_split").
-- Every payment amount is the gross amount received (GST included when charged).
-- gst_rate on the payment says how much of it is GST; the split is calculated.
alter table public.payments
  add column if not exists gst_amount numeric
    generated always as (round(amount * coalesce(gst_rate, 0) / (100 + coalesce(gst_rate, 0)), 2)) stored,
  add column if not exists net_amount numeric
    generated always as (amount - round(amount * coalesce(gst_rate, 0) / (100 + coalesce(gst_rate, 0)), 2)) stored;

-- New payments inherit the deal's GST setting unless a rate is given explicitly.
create or replace function public.payments_default_gst_rate()
returns trigger language plpgsql as $$
begin
  if new.gst_rate is null then
    select case when d.gst_applicable then coalesce(d.gst_rate, 18) else 0 end
      into new.gst_rate
      from public.deals d where d.id = new.deal_id;
  end if;
  return new;
end $$;

drop trigger if exists payments_default_gst_rate on public.payments;
create trigger payments_default_gst_rate
  before insert on public.payments
  for each row execute function public.payments_default_gst_rate();

-- One-time backfill (run separately in production): existing payments take their deal's setting.
update public.payments p
   set gst_rate = case when d.gst_applicable then coalesce(d.gst_rate, 18) else 0 end
  from public.deals d
 where d.id = p.deal_id and p.gst_rate is null;
