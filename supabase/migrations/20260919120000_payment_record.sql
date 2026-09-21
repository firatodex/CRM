-- Payment Record Phase 1 — extend deals + payments for close price / recurring / discount / reminders
-- Schema: public (deployment)
-- Idempotent.

alter table public.deals
  add column if not exists pricing_model text
    check (pricing_model is null or pricing_model in ('one_time', 'recurring')),
  add column if not exists list_price numeric,
  add column if not exists discount_percent numeric not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  add column if not exists discount_amount numeric not null default 0
    check (discount_amount >= 0),
  add column if not exists net_price numeric,
  add column if not exists monthly_price numeric,
  add column if not exists net_monthly_price numeric,
  add column if not exists billing_cadence text
    check (billing_cadence is null or billing_cadence in ('1m', '3m', '6m', '12m', 'custom')),
  add column if not exists custom_interval_months integer
    check (custom_interval_months is null or custom_interval_months >= 1),
  add column if not exists billing_start_date date,
  add column if not exists next_reminder_at date,
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists currency text not null default 'INR',
  add column if not exists first_month_amount numeric
    check (first_month_amount is null or first_month_amount >= 0);

alter table public.payments
  add column if not exists kind text
    check (kind is null or kind in ('one_time', 'recurring_period', 'adjustment', 'first_month')),
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists reminder_sent_at timestamptz;

-- Backfill pricing_model from legacy subscription_type where empty
update public.deals
set pricing_model = case
  when subscription_type in ('monthly', 'annual') then 'recurring'
  else 'one_time'
end
where pricing_model is null;

update public.deals
set list_price = coalesce(list_price, deal_value),
    net_price = coalesce(net_price, deal_value)
where list_price is null or net_price is null;

notify pgrst, 'reload schema';
