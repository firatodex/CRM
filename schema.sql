-- ══════════════════════════════════════════════════
-- OpsCraft CRM v2 — Supabase Schema
-- Run this in Supabase → SQL Editor
-- ══════════════════════════════════════════════════

-- ── 1. Enable UUID extension (if not already) ──
create extension if not exists "uuid-ossp";

-- ── 2. Clients table ──
create table if not exists clients (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz default now(),

  -- Core identity
  name            text not null,
  company         text,
  business_type   text,

  -- Contact info
  phone           text,
  email           text,
  website         text,

  -- Pipeline
  stage           text not null default 'lead'
    check (stage in ('lead','contacted','proposal','active','dead')),
  temperature     text
    check (temperature in ('hot','warm','cold') or temperature is null),
  source          text,

  -- Business intel
  potential_revenue numeric,
  pain_point      text,

  -- Next action
  next_action     text,
  next_action_due date,

  -- Tracking
  last_contacted_at timestamptz,
  notes           text
);

-- ── 3. Contact history log ──
create table if not exists contact_log (
  id            uuid primary key default uuid_generate_v4(),
  client_id     uuid not null references clients(id) on delete cascade,
  contacted_at  timestamptz default now(),
  method        text not null,
  note          text
);

-- ── 4. Indexes for performance ──
create index if not exists idx_clients_stage on clients(stage);
create index if not exists idx_clients_next_action_due on clients(next_action_due);
create index if not exists idx_clients_temperature on clients(temperature);
create index if not exists idx_contact_log_client on contact_log(client_id);
create index if not exists idx_contact_log_date on contact_log(contacted_at desc);

-- ── 5. Row Level Security ──
alter table clients enable row level security;
alter table contact_log enable row level security;

-- Allow all operations for anon key (single-user CRM)
create policy "Allow all on clients" on clients
  for all using (true) with check (true);

create policy "Allow all on contact_log" on contact_log
  for all using (true) with check (true);


-- ══════════════════════════════════════════════════
-- MIGRATION: If you already have the old clients table
-- and want to ADD the new columns without losing data,
-- run these ALTER statements instead of recreating:
-- ══════════════════════════════════════════════════

-- alter table clients add column if not exists temperature text
--   check (temperature in ('hot','warm','cold') or temperature is null);
-- alter table clients add column if not exists source text;
-- alter table clients add column if not exists potential_revenue numeric;
-- alter table clients add column if not exists pain_point text;
-- alter table clients add column if not exists website text;
-- alter table clients add column if not exists last_contacted_at timestamptz;
--
-- Then create the contact_log table and indexes above.
-- ══════════════════════════════════════════════════
