-- First-month extra payment on recurring plans (public schema)
-- Idempotent.

alter table public.deals
  add column if not exists first_month_amount numeric
    check (first_month_amount is null or first_month_amount >= 0);

alter table public.payments drop constraint if exists payments_kind_check;

alter table public.payments
  add constraint payments_kind_check
  check (kind is null or kind in ('one_time', 'recurring_period', 'adjustment', 'first_month'));

notify pgrst, 'reload schema';
