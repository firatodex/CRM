-- ══════════════════════════════════════════════════
-- Dyzen Solar CRM — Frequency Supabase staging
-- Schema: dyzen
-- Idempotent. Safe to re-run.
-- ══════════════════════════════════════════════════

create schema if not exists dyzen;
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

set search_path to dyzen, public, extensions;

-- Prefer gen_random_uuid() (pgcrypto); fall back via uuid_generate_v4 if needed.
-- Most Supabase images have both.

-- ── users (CRM team roster — not auth.users) ──
create table if not exists dyzen.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text not null,
  phone         text,
  role          text not null default 'viewer',
  department    text,
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  last_login_at timestamptz
);

-- ── clients ──
create table if not exists dyzen.clients (
  id                         uuid primary key default gen_random_uuid(),
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now(),

  name                       text not null,
  company                    text,
  business_type              text,
  phone                      text,
  email                      text,
  website                    text,

  stage                      text not null default 'lead'
    check (stage in ('lead','contacted','proposal','active','dead')),
  temperature                text
    check (temperature in ('hot','warm','cold') or temperature is null),
  source                     text,

  potential_revenue          numeric,
  pain_point                 text,
  notes                      text,

  next_action                text,
  next_action_due            date,
  next_action_time           text,

  last_contacted_at          timestamptz,
  proposal_sent_at           timestamptz,
  proposal_value             numeric,
  current_solution           text,
  objection                  text,

  discovery_team_size        text,
  discovery_monthly_leads    text,
  discovery_current_tool     text,
  discovery_lost_deals       text,
  discovery_decision_maker   text,
  discovery_switch_openness  text,
  discovery_completed_at     timestamptz,

  won_at                     timestamptz,
  won_from_stage             text,

  -- Phase 1 ownership
  created_by                 uuid references dyzen.users(id),
  owned_by                   uuid references dyzen.users(id),

  -- Sales-process scoring / qualification
  icp_match_score            integer not null default 0 check (icp_match_score between 0 and 100),
  lead_score                 integer not null default 0,
  qualification_status       text not null default 'lead_unqualified'
    check (qualification_status in ('lead_unqualified', 'lead_qualified', 'needs_review')),
  primary_contact_role       text
    check (primary_contact_role in ('economic_buyer', 'technical_buyer', 'user_champion', 'influencer', 'coach') or primary_contact_role is null),
  internal_champion_name     text,
  internal_champion_identified boolean not null default false,
  territory                  text,
  segment                    text,
  expected_stage_duration_days integer not null default 0,
  deal_stalled_flag          boolean not null default false,
  deal_stalled_since         timestamptz,
  stage_days_count           integer not null default 0
);

-- ── contact_log ──
create table if not exists dyzen.contact_log (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references dyzen.clients(id) on delete cascade,
  contacted_at           timestamptz default now(),
  method                 text not null,
  note                   text,
  note_what_happened     text,
  note_what_next         text,
  progress               boolean not null default false,
  created_by             uuid references dyzen.users(id),

  contact_outcome        text
    check (contact_outcome in ('call_booked', 'objection_raised', 'decision_pending', 'no_interest', 'wrong_fit', 'needs_info') or contact_outcome is null),
  objection_type         text
    check (objection_type in ('price', 'competitor', 'timing', 'need', 'authority', 'budget', 'other') or objection_type is null),
  objection_counter_used text,
  meeting_commitment_made boolean not null default false,
  commitment_specificity text,
  prospect_confirmed     boolean not null default false,
  call_summary_json      jsonb,
  discovery_completed    boolean not null default false
);

-- ── deals ──
create table if not exists dyzen.deals (
  id                         uuid primary key default gen_random_uuid(),
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now(),
  client_id                  uuid not null references dyzen.clients(id) on delete cascade,
  company                    text,
  stage                      text,
  deal_value                 numeric not null default 0,
  product_sold               text,
  payment_type               text,
  subscription_type          text,
  subscription_start         date,
  subscription_end           date,
  delivery_status            boolean not null default false,
  delivered_at               date,
  notes                      text,

  -- Phase 1 ownership / delivery
  deal_owner_id              uuid references dyzen.users(id),
  delivery_owner_id          uuid references dyzen.users(id),
  implementation_status      text default 'not_started',
  deal_assigned_at           timestamptz,
  delivery_assigned_at       timestamptz,
  assigned_by                uuid references dyzen.users(id),
  created_by                 uuid references dyzen.users(id),
  updated_by                 uuid references dyzen.users(id),
  delivery_start_date        date,
  delivery_target_date       date,
  delivery_actual_date       date,
  customer_sign_off_date     date,

  -- Sales-process momentum
  days_in_proposal_stage     integer not null default 0,
  deal_momentum_score        integer not null default 0 check (deal_momentum_score between 0 and 10),
  proposal_version_count     integer not null default 1,
  competitive_situation      text
    check (competitive_situation in ('vs_specific_competitor', 'vs_donothing', 'vs_multiple', 'unknown') or competitive_situation is null),
  win_reason                 text
    check (win_reason in ('better_fit', 'price', 'relationship', 'timing', 'urgency', 'other') or win_reason is null),
  loss_reason                text
    check (loss_reason in ('price', 'competitor', 'timeline', 'budget', 'authority', 'need', 'other') or loss_reason is null),
  forecast_status            text
    check (forecast_status in ('on_track', 'at_risk', 'closed_won', 'closed_lost') or forecast_status is null),
  contract_term_months       integer not null default 12,
  expected_renewal_date      timestamptz,
  expansion_opportunity_value numeric not null default 0
);

-- ── payments ──
create table if not exists dyzen.payments (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  deal_id    uuid not null references dyzen.deals(id) on delete cascade,
  label      text,
  amount     numeric not null default 0,
  due_date   date,
  paid       boolean not null default false,
  paid_at    date,
  created_by uuid references dyzen.users(id)
);

-- ── onboarding_steps ──
create table if not exists dyzen.onboarding_steps (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  client_id    uuid not null references dyzen.clients(id) on delete cascade,
  step_order   integer not null default 0,
  step_label   text not null,
  due_date     date,
  completed    boolean not null default false,
  completed_at timestamptz,
  notes        text
);

-- ── tasks ──
create table if not exists dyzen.tasks (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_id  uuid references dyzen.clients(id) on delete cascade,
  task_type  text,
  title      text,
  note       text,
  due_date   date,
  due_time   text,
  done       boolean not null default false,
  done_at    timestamptz
);

-- ── pipeline_snapshots ──
create table if not exists dyzen.pipeline_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz default now(),
  snapshot_date      date not null unique,
  contacted_count    integer not null default 0,
  proposal_count     integer not null default 0,
  points             integer not null default 0,
  wins_today         integer not null default 0,
  win_points_removed integer not null default 0
);

-- ── final_step_clients ──
create table if not exists dyzen.final_step_clients (
  client_id  uuid primary key references dyzen.clients(id) on delete cascade,
  created_at timestamptz default now()
);

-- ── lead_contacts ──
create table if not exists dyzen.lead_contacts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  client_id   uuid not null references dyzen.clients(id) on delete cascade,
  name        text not null,
  designation text,
  phone       text
);

-- ── audit_log ──
create table if not exists dyzen.audit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references dyzen.users(id),
  action     text not null,
  table_name text not null,
  record_id  text not null,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz default now()
);

-- ── deal_ownership_history ──
create table if not exists dyzen.deal_ownership_history (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references dyzen.deals(id) on delete cascade,
  previous_owner_id uuid references dyzen.users(id),
  new_owner_id      uuid not null references dyzen.users(id),
  change_type       text not null,
  changed_by        uuid not null references dyzen.users(id),
  reason            text,
  changed_at        timestamptz default now()
);

-- ── implementations ──
create table if not exists dyzen.implementations (
  id                    uuid primary key default gen_random_uuid(),
  deal_id               uuid not null unique references dyzen.deals(id) on delete cascade,
  client_id             uuid not null references dyzen.clients(id) on delete cascade,
  status                text not null default 'not_started',
  status_updated_at     timestamptz,
  status_updated_by     uuid references dyzen.users(id),
  planned_start_date    date,
  actual_start_date     date,
  planned_end_date      date,
  actual_end_date       date,
  completion_percentage int default 0,
  assigned_to           uuid not null references dyzen.users(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  updated_by            uuid references dyzen.users(id)
);

create table if not exists dyzen.implementation_milestones (
  id                uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references dyzen.implementations(id) on delete cascade,
  name              text not null,
  description       text,
  target_date       date not null,
  actual_date       date,
  status            text default 'pending',
  owner_id          uuid references dyzen.users(id),
  created_at        timestamptz default now()
);

create table if not exists dyzen.implementation_blockers (
  id                uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references dyzen.implementations(id) on delete cascade,
  title             text not null,
  description       text,
  severity          text not null,
  reported_by       uuid references dyzen.users(id),
  assigned_to       uuid references dyzen.users(id),
  status            text default 'open',
  resolved_date     timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists dyzen.implementation_tasks (
  id                uuid primary key default gen_random_uuid(),
  implementation_id uuid not null references dyzen.implementations(id) on delete cascade,
  task_name         text not null,
  description       text,
  owner_id          uuid references dyzen.users(id),
  status            text default 'pending',
  due_date          date,
  completed_date    date,
  task_order        int,
  created_at        timestamptz default now()
);

create table if not exists dyzen.customer_health (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null unique references dyzen.clients(id) on delete cascade,
  delivery_score       int default 50,
  engagement_score     int default 50,
  payment_score        int default 50,
  usage_score          int default 50,
  satisfaction_score   int default 50,
  is_at_churn_risk     boolean default false,
  churn_risk_reason    text,
  last_assessment_date timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table if not exists dyzen.health_history (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references dyzen.clients(id) on delete cascade,
  health_score  int,
  health_status text,
  recorded_at   timestamptz default now()
);

-- ── sales-process tables ──
create table if not exists dyzen.ideal_customer_profile (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  user_id                uuid,
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

create table if not exists dyzen.lead_scoring_rules (
  id             uuid primary key default gen_random_uuid(),
  rule_name      text not null,
  rule_criteria  jsonb not null,
  points_awarded integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  order_sequence integer not null default 0
);

create table if not exists dyzen.objection_playbook (
  id                  uuid primary key default gen_random_uuid(),
  objection_type      text not null
    check (objection_type in ('price', 'competitor', 'timing', 'need', 'authority', 'budget', 'other')),
  objection_statement text not null,
  counter_strategy    text not null,
  success_rate        numeric check (success_rate between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists dyzen.sales_activity_targets (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid,
  period                    text not null check (period in ('weekly', 'monthly')),
  target_cold_calls         integer not null default 0,
  target_followups          integer not null default 0,
  target_in_person_meetings integer not null default 0,
  target_discoveries        integer not null default 0,
  target_proposals          integer not null default 0,
  target_closes             integer not null default 0,
  effective_from            timestamptz not null default now()
);

create table if not exists dyzen.forecast_log (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid,
  period_month          text not null,
  forecasted_revenue    numeric not null default 0,
  forecasted_wins       integer not null default 0,
  actual_revenue        numeric not null default 0,
  actual_wins           integer not null default 0,
  forecast_accuracy_pct numeric,
  created_at            timestamptz not null default now(),
  finalized_at          timestamptz
);

create table if not exists dyzen.win_loss_analysis (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid,
  deal_id              uuid references dyzen.deals(id) on delete set null,
  outcome              text not null check (outcome in ('won', 'lost')),
  primary_reason       text not null,
  secondary_reasons    text[] not null default '{}',
  competitive_context  text,
  estimated_deal_value numeric,
  lessons_learned      text,
  created_at           timestamptz not null default now()
);

-- ── indexes ──
create index if not exists idx_clients_stage on dyzen.clients(stage);
create index if not exists idx_clients_next_action_due on dyzen.clients(next_action_due);
create index if not exists idx_clients_temperature on dyzen.clients(temperature);
create index if not exists idx_clients_qualification_status on dyzen.clients(qualification_status);
create index if not exists idx_clients_territory on dyzen.clients(territory);
create index if not exists idx_clients_segment on dyzen.clients(segment);
create index if not exists idx_clients_deal_stalled_flag on dyzen.clients(deal_stalled_flag);
create index if not exists idx_contact_log_client on dyzen.contact_log(client_id);
create index if not exists idx_contact_log_date on dyzen.contact_log(contacted_at desc);
create index if not exists idx_contact_log_contact_outcome on dyzen.contact_log(contact_outcome);
create index if not exists idx_contact_log_objection_type on dyzen.contact_log(objection_type);
create index if not exists idx_deals_client on dyzen.deals(client_id);
create index if not exists idx_deals_deal_owner on dyzen.deals(deal_owner_id);
create index if not exists idx_deals_delivery_owner on dyzen.deals(delivery_owner_id);
create index if not exists idx_deals_implementation_status on dyzen.deals(implementation_status);
create index if not exists idx_deals_forecast_status on dyzen.deals(forecast_status);
create index if not exists idx_deals_competitive_situation on dyzen.deals(competitive_situation);
create index if not exists idx_payments_deal on dyzen.payments(deal_id);
create index if not exists idx_onboarding_client on dyzen.onboarding_steps(client_id);
create index if not exists idx_tasks_client on dyzen.tasks(client_id);
create index if not exists idx_tasks_due_date on dyzen.tasks(due_date);
create index if not exists idx_lead_contacts_client on dyzen.lead_contacts(client_id);
create index if not exists idx_implementations_assigned_to on dyzen.implementations(assigned_to);
create index if not exists idx_implementations_status on dyzen.implementations(status);
create index if not exists idx_implementations_deal_id on dyzen.implementations(deal_id);
create index if not exists idx_blockers_implementation on dyzen.implementation_blockers(implementation_id);
create index if not exists idx_health_client on dyzen.customer_health(client_id);
create index if not exists idx_health_status on dyzen.customer_health(is_at_churn_risk);
create index if not exists idx_audit_user on dyzen.audit_log(user_id);
create index if not exists idx_audit_table on dyzen.audit_log(table_name);
create index if not exists idx_win_loss_deal_id on dyzen.win_loss_analysis(deal_id);
create index if not exists idx_forecast_log_period_month on dyzen.forecast_log(period_month);

-- ── forecast accuracy trigger ──
create or replace function dyzen.calculate_forecast_accuracy()
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

drop trigger if exists trg_forecast_accuracy on dyzen.forecast_log;
create trigger trg_forecast_accuracy
  before insert or update on dyzen.forecast_log
  for each row execute function dyzen.calculate_forecast_accuracy();

-- ── RLS (LAN staging: permissive for anon — tighten before public HTTPS) ──
do $$
declare
  t text;
begin
  foreach t in array array[
    'users','clients','contact_log','deals','payments','onboarding_steps','tasks',
    'pipeline_snapshots','final_step_clients','lead_contacts','audit_log',
    'deal_ownership_history','implementations','implementation_milestones',
    'implementation_blockers','implementation_tasks','customer_health','health_history',
    'ideal_customer_profile','lead_scoring_rules','objection_playbook',
    'sales_activity_targets','forecast_log','win_loss_analysis','ping','_ping'
  ]
  loop
    if to_regclass('dyzen.' || t) is not null then
      execute format('alter table dyzen.%I enable row level security', t);
      execute format('drop policy if exists "dyzen_anon_all_%s" on dyzen.%I', t, t);
      execute format(
        'create policy "dyzen_anon_all_%s" on dyzen.%I for all using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end $$;

-- ── grants for PostgREST roles ──
grant usage on schema dyzen to anon, authenticated, service_role;
grant all on all tables in schema dyzen to anon, authenticated, service_role;
grant all on all sequences in schema dyzen to anon, authenticated, service_role;
grant all on all functions in schema dyzen to anon, authenticated, service_role;
alter default privileges in schema dyzen grant all on tables to anon, authenticated, service_role;
alter default privileges in schema dyzen grant all on sequences to anon, authenticated, service_role;

-- seed admin user (idempotent)
insert into dyzen.users (email, name, role, is_active)
values ('dosaniafzal92@gmail.com', 'Afzal Dosani', 'admin', true)
on conflict (email) do nothing;

-- optional: drop smoke-test ping later with:
-- drop table if exists dyzen.ping;
-- drop table if exists dyzen._ping;

notify pgrst, 'reload schema';
