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
-- note_what_happened and note_what_next are stored as separate columns
-- instead of being concatenated into a single string with a delimiter.
-- The old single `note` column is kept for backward compatibility with
-- existing rows; new rows will use the two split columns.
create table if not exists contact_log (
  id                  uuid primary key default uuid_generate_v4(),
  client_id           uuid not null references clients(id) on delete cascade,
  contacted_at        timestamptz default now(),
  method              text not null,
  -- Legacy single-note column (kept for existing data)
  note                text,
  -- New split columns (used for all new log entries)
  note_what_happened  text,
  note_what_next      text
);

-- ── 4. Indexes for performance ──
create index if not exists idx_clients_stage on clients(stage);
create index if not exists idx_clients_next_action_due on clients(next_action_due);
create index if not exists idx_clients_temperature on clients(temperature);
create index if not exists idx_contact_log_client on contact_log(client_id);
create index if not exists idx_contact_log_date on contact_log(contacted_at desc);

-- ── 5. Row Level Security ──
-- WARNING: The policies below allow full access to the anon key.
-- This is only acceptable for a strictly single-user, private deployment
-- where the Supabase URL and anon key are kept secret (e.g. via .env.local
-- and never committed to a public repo).
-- For any multi-user or shared deployment, replace these with proper
-- auth-based policies, e.g.:
--   using (auth.uid() = user_id)
alter table clients enable row level security;
alter table contact_log enable row level security;

create policy "Allow all on clients" on clients
  for all using (true) with check (true);

create policy "Allow all on contact_log" on contact_log
  for all using (true) with check (true);


-- ══════════════════════════════════════════════════
-- MIGRATION: If you already have the tables and need
-- to ADD the new split-note columns without losing data
-- ══════════════════════════════════════════════════
-- alter table contact_log add column if not exists note_what_happened text;
-- alter table contact_log add column if not exists note_what_next text;
