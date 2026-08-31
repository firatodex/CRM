-- ══════════════════════════════════════════════════
-- OpsCraft CRM — Sales Process Optimization
-- Adds ICP/lead scoring, structured discovery calls, deal
-- momentum tracking, objection playbook, activity targets,
-- forecasting, and win/loss analysis.
--
-- Safe to run multiple times (all statements are additive
-- and guarded with IF NOT EXISTS / IF EXISTS).
--
-- ROLLBACK: see the DOWN migration block at the bottom of
-- this file — run it to fully undo everything below.
-- ══════════════════════════════════════════════════

-- ── 0. Extensions ──
create extension if not exists "uuid-ossp";

-- ══════════════════════════════════════════════════
-- 1. clients — lead qualification & scoring
-- ══════════════════════════════════════════════════
alter table clients add column if not exists icp_match_score integer not null default 0
  check (icp_match_score between 0 and 100);
alter table clients add column if not exists lead_score integer not null default 0;
alter table clients add column if not exists qualification_status text not null default 'lead_unqualified'
  check (qualification_status in ('lead_unqualified', 'lead_qualified', 'needs_review'));
alter table clients add column if not exists primary_contact_role text
  check (primary_contact_role in ('economic_buyer', 'technical_buyer', 'user_champion', 'influencer', 'coach') or primary_contact_role is null);
alter table clients add column if not exists internal_champion_name text;
alter table clients add column if not exists internal_champion_identified boolean not null default false;
alter table clients add column if not exists territory text;
alter table clients add column if not exists segment text;
alter table clients add column if not exists expected_stage_duration_days integer not null default 0;
alter table clients add column if not exists deal_stalled_flag boolean not null default false;
alter table clients add column if not exists deal_stalled_since timestamptz;

-- stage_days_count is computed from created_at at read time (see view below);
-- stored as a plain column too so it can be filtered/sorted on directly and
-- backfilled/refreshed by a scheduled job without needing a generated-column
-- migration (Supabase Postgres versions vary in generated-column support).
alter table clients add column if not exists stage_days_count integer not null default 0;

create index if not exists idx_clients_qualification_status on clients(qualification_status);
create index if not exists idx_clients_territory on clients(territory);
create index if not exists idx_clients_segment on clients(segment);
create index if not exists idx_clients_deal_stalled_flag on clients(deal_stalled_flag);

-- ══════════════════════════════════════════════════
-- 2. contact_log — structured discovery & objection handling
-- ══════════════════════════════════════════════════
alter table contact_log add column if not exists contact_outcome text
  check (contact_outcome in ('call_booked', 'objection_raised', 'decision_pending', 'no_interest', 'wrong_fit', 'needs_info') or contact_outcome is null);
alter table contact_log add column if not exists objection_type text
  check (objection_type in ('price', 'competitor', 'timing', 'need', 'authority', 'budget', 'other') or objection_type is null);
alter table contact_log add column if not exists objection_counter_used text;
alter table contact_log add column if not exists meeting_commitment_made boolean not null default false;
alter table contact_log add column if not exists commitment_specificity text;
alter table contact_log add column if not exists prospect_confirmed boolean not null default false;
alter table contact_log add column if not exists call_summary_json jsonb;
alter table contact_log add column if not exists discovery_completed boolean not null default false;

create index if not exists idx_contact_log_contact_outcome on contact_log(contact_outcome);
create index if not exists idx_contact_log_objection_type on contact_log(objection_type);

-- ══════════════════════════════════════════════════
-- 3. deals — momentum, competitive context, win/loss, renewal
-- ══════════════════════════════════════════════════
-- NOTE: the `deals` table already exists (created outside this repo's
-- tracked migrations). Guard every alter in case it's missing in a given
-- environment.
do $$
begin
  if to_regclass('public.deals') is not null then
    alter table deals add column if not exists days_in_proposal_stage integer not null default 0;
    alter table deals add column if not exists deal_momentum_score integer not null default 0
      check (deal_momentum_score between 0 and 10);
    alter table deals add column if not exists proposal_version_count integer not null default 1;
    alter table deals add column if not exists competitive_situation text
      check (competitive_situation in ('vs_specific_competitor', 'vs_donothing', 'vs_multiple', 'unknown') or competitive_situation is null);
    alter table deals add column if not exists win_reason text
      check (win_reason in ('better_fit', 'price', 'relationship', 'timing', 'urgency', 'other') or win_reason is null);
    alter table deals add column if not exists loss_reason text
      check (loss_reason in ('price', 'competitor', 'timeline', 'budget', 'authority', 'need', 'other') or loss_reason is null);
    alter table deals add column if not exists forecast_status text
      check (forecast_status in ('on_track', 'at_risk', 'closed_won', 'closed_lost') or forecast_status is null);
    alter table deals add column if not exists contract_term_months integer not null default 12;
    alter table deals add column if not exists expected_renewal_date timestamptz;
    alter table deals add column if not exists expansion_opportunity_value numeric not null default 0;

    create index if not exists idx_deals_forecast_status on deals(forecast_status);
    create index if not exists idx_deals_competitive_situation on deals(competitive_situation);
  end if;
end $$;

-- ══════════════════════════════════════════════════
-- 4. New tables
-- ══════════════════════════════════════════════════

create table if not exists ideal_customer_profile (
  id                     uuid primary key default uuid_generate_v4(),
  created_at             timestamptz not null default now(),
  user_id                uuid references auth.users(id) default auth.uid(),
  company_size_min       integer,
  company_size_max       integer,
  annual_revenue_min     numeric,
  annual_revenue_max     numeric,
  industry_vertical      text,
  geography              text[] not null default '{}',
  use_case_fit           text,
  budget_min             numeric,
  budget_max             numeric,
  decision_timeline_days integer,
  notes                  text
);

create table if not exists lead_scoring_rules (
  id              uuid primary key default uuid_generate_v4(),
  rule_name       text not null,
  rule_criteria   jsonb not null,
  points_awarded  integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  order_sequence  integer not null default 0
);

create table if not exists objection_playbook (
  id                  uuid primary key default uuid_generate_v4(),
  objection_type      text not null
    check (objection_type in ('price', 'competitor', 'timing', 'need', 'authority', 'budget', 'other')),
  objection_statement text not null,
  counter_strategy    text not null,
  success_rate        numeric check (success_rate between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists sales_activity_targets (
  id                          uuid primary key default uuid_generate_v4(),
  user_id                     uuid references auth.users(id) default auth.uid(),
  period                      text not null check (period in ('weekly', 'monthly')),
  target_cold_calls           integer not null default 0,
  target_followups            integer not null default 0,
  target_in_person_meetings   integer not null default 0,
  target_discoveries          integer not null default 0,
  target_proposals            integer not null default 0,
  target_closes               integer not null default 0,
  effective_from              timestamptz not null default now()
);

create table if not exists forecast_log (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid references auth.users(id) default auth.uid(),
  period_month           text not null, -- e.g. "2026-08"
  forecasted_revenue     numeric not null default 0,
  forecasted_wins        integer not null default 0,
  actual_revenue         numeric not null default 0,
  actual_wins            integer not null default 0,
  forecast_accuracy_pct  numeric,
  created_at             timestamptz not null default now(),
  finalized_at           timestamptz
);

create table if not exists win_loss_analysis (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid references auth.users(id) default auth.uid(),
  deal_id               uuid references deals(id) on delete set null,
  outcome               text not null check (outcome in ('won', 'lost')),
  primary_reason        text not null,
  secondary_reasons     text[] not null default '{}',
  competitive_context   text,
  estimated_deal_value  numeric,
  lessons_learned       text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_win_loss_deal_id on win_loss_analysis(deal_id);
create index if not exists idx_forecast_log_period_month on forecast_log(period_month);

-- ══════════════════════════════════════════════════
-- 5. forecast_accuracy_pct auto-calculation
-- ══════════════════════════════════════════════════
create or replace function calculate_forecast_accuracy()
returns trigger as $$
begin
  if new.forecasted_revenue is not null and new.forecasted_revenue <> 0 then
    new.forecast_accuracy_pct := round((new.actual_revenue / new.forecasted_revenue) * 100, 2);
  else
    new.forecast_accuracy_pct := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_forecast_accuracy on forecast_log;
create trigger trg_forecast_accuracy
  before insert or update on forecast_log
  for each row execute function calculate_forecast_accuracy();

-- ══════════════════════════════════════════════════
-- 6. Row Level Security
-- ══════════════════════════════════════════════════
alter table ideal_customer_profile enable row level security;
alter table lead_scoring_rules enable row level security;
alter table objection_playbook enable row level security;
alter table sales_activity_targets enable row level security;
alter table forecast_log enable row level security;
alter table win_loss_analysis enable row level security;

-- Shared reference data (ICP, scoring rules, objection playbook): readable by
-- any authenticated user, writable only by the row owner (matches this repo's
-- existing single-tenant-per-login model — see src/lib/rls_policies.sql for
-- the admin-gated variant to use once role-based auth is introduced).
create policy "read icp" on ideal_customer_profile for select using (auth.role() = 'authenticated');
create policy "write own icp" on ideal_customer_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read scoring rules" on lead_scoring_rules for select using (auth.role() = 'authenticated');
create policy "write scoring rules" on lead_scoring_rules for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "read objection playbook" on objection_playbook for select using (auth.role() = 'authenticated');
create policy "write objection playbook" on objection_playbook for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "own activity targets" on sales_activity_targets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own forecast log" on forecast_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own win loss analysis" on win_loss_analysis for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ══════════════════════════════════════════════════
-- ROLLBACK (DOWN migration) — run this block to fully revert
-- everything above. Kept in the same file so the down-migration
-- never drifts from the up-migration.
-- ══════════════════════════════════════════════════
-- drop table if exists win_loss_analysis;
-- drop table if exists forecast_log;
-- drop table if exists sales_activity_targets;
-- drop table if exists objection_playbook;
-- drop table if exists lead_scoring_rules;
-- drop table if exists ideal_customer_profile;
-- drop trigger if exists trg_forecast_accuracy on forecast_log;
-- drop function if exists calculate_forecast_accuracy();
--
-- do $$
-- begin
--   if to_regclass('public.deals') is not null then
--     alter table deals
--       drop column if exists days_in_proposal_stage,
--       drop column if exists deal_momentum_score,
--       drop column if exists proposal_version_count,
--       drop column if exists competitive_situation,
--       drop column if exists win_reason,
--       drop column if exists loss_reason,
--       drop column if exists forecast_status,
--       drop column if exists contract_term_months,
--       drop column if exists expected_renewal_date,
--       drop column if exists expansion_opportunity_value;
--   end if;
-- end $$;
--
-- alter table contact_log
--   drop column if exists contact_outcome,
--   drop column if exists objection_type,
--   drop column if exists objection_counter_used,
--   drop column if exists meeting_commitment_made,
--   drop column if exists commitment_specificity,
--   drop column if exists prospect_confirmed,
--   drop column if exists call_summary_json,
--   drop column if exists discovery_completed;
--
-- alter table clients
--   drop column if exists icp_match_score,
--   drop column if exists lead_score,
--   drop column if exists qualification_status,
--   drop column if exists primary_contact_role,
--   drop column if exists internal_champion_name,
--   drop column if exists internal_champion_identified,
--   drop column if exists territory,
--   drop column if exists segment,
--   drop column if exists expected_stage_duration_days,
--   drop column if exists stage_days_count,
--   drop column if exists deal_stalled_flag,
--   drop column if exists deal_stalled_since;
