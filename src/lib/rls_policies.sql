-- ══════════════════════════════════════════════════
-- RLS policies for the sales-process tables, using proper
-- role-based admin gating (requires a `profiles` or `users`
-- table with a `role` column — this repo already has `users`
-- from the Phase 1 migration, so `is_admin()` reads from that).
--
-- The migration in supabase/migrations/20260830120000_add_sales_process_gaps.sql
-- ships a simpler "any authenticated user" policy set so the
-- tables are usable immediately in this single-tenant deployment.
-- Apply the policies below instead (they DROP + recreate the
-- migration's versions) once you have real admin/sales roles to
-- gate on.
-- ══════════════════════════════════════════════════

create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from users
    where users.email = auth.jwt() ->> 'email'
      and users.role = 'admin'
      and users.active = true
  );
$$ language sql stable security definer;

-- ── ideal_customer_profile ──
-- SELECT: anyone (authenticated) — shared reference data
-- INSERT/UPDATE/DELETE: admin only
drop policy if exists "read icp" on ideal_customer_profile;
drop policy if exists "write own icp" on ideal_customer_profile;

create policy "icp select all" on ideal_customer_profile
  for select using (auth.role() = 'authenticated');
create policy "icp admin write" on ideal_customer_profile
  for insert with check (is_admin());
create policy "icp admin update" on ideal_customer_profile
  for update using (is_admin()) with check (is_admin());
create policy "icp admin delete" on ideal_customer_profile
  for delete using (is_admin());

-- ── lead_scoring_rules ──
-- SELECT: anyone (authenticated) — shared rules
-- INSERT/UPDATE/DELETE: admin only
drop policy if exists "read scoring rules" on lead_scoring_rules;
drop policy if exists "write scoring rules" on lead_scoring_rules;

create policy "scoring rules select all" on lead_scoring_rules
  for select using (auth.role() = 'authenticated');
create policy "scoring rules admin write" on lead_scoring_rules
  for insert with check (is_admin());
create policy "scoring rules admin update" on lead_scoring_rules
  for update using (is_admin()) with check (is_admin());
create policy "scoring rules admin delete" on lead_scoring_rules
  for delete using (is_admin());

-- ── objection_playbook ──
-- SELECT: anyone (authenticated)
-- INSERT/UPDATE/DELETE: admin only
drop policy if exists "read objection playbook" on objection_playbook;
drop policy if exists "write objection playbook" on objection_playbook;

create policy "objection playbook select all" on objection_playbook
  for select using (auth.role() = 'authenticated');
create policy "objection playbook admin write" on objection_playbook
  for insert with check (is_admin());
create policy "objection playbook admin update" on objection_playbook
  for update using (is_admin()) with check (is_admin());
create policy "objection playbook admin delete" on objection_playbook
  for delete using (is_admin());

-- ── sales_activity_targets ──
-- SELECT: own user's targets + admin
-- INSERT/UPDATE/DELETE: admin only
drop policy if exists "own activity targets" on sales_activity_targets;

create policy "activity targets select own or admin" on sales_activity_targets
  for select using (auth.uid() = user_id or is_admin());
create policy "activity targets admin write" on sales_activity_targets
  for insert with check (is_admin());
create policy "activity targets admin update" on sales_activity_targets
  for update using (is_admin()) with check (is_admin());
create policy "activity targets admin delete" on sales_activity_targets
  for delete using (is_admin());

-- ── forecast_log ──
-- SELECT: own user's forecasts + admin
-- INSERT/UPDATE/DELETE: own user + admin
drop policy if exists "own forecast log" on forecast_log;

create policy "forecast log select own or admin" on forecast_log
  for select using (auth.uid() = user_id or is_admin());
create policy "forecast log write own or admin" on forecast_log
  for insert with check (auth.uid() = user_id or is_admin());
create policy "forecast log update own or admin" on forecast_log
  for update using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id or is_admin());
create policy "forecast log delete own or admin" on forecast_log
  for delete using (auth.uid() = user_id or is_admin());

-- ── win_loss_analysis ──
-- SELECT: own user's analysis + admin
-- INSERT/UPDATE/DELETE: own user + admin
drop policy if exists "own win loss analysis" on win_loss_analysis;

create policy "win loss select own or admin" on win_loss_analysis
  for select using (auth.uid() = user_id or is_admin());
create policy "win loss write own or admin" on win_loss_analysis
  for insert with check (auth.uid() = user_id or is_admin());
create policy "win loss update own or admin" on win_loss_analysis
  for update using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id or is_admin());
create policy "win loss delete own or admin" on win_loss_analysis
  for delete using (auth.uid() = user_id or is_admin());

-- ══════════════════════════════════════════════════
-- ROLLBACK: revert to the migration's simpler policies
-- ══════════════════════════════════════════════════
-- drop policy if exists "icp select all" on ideal_customer_profile;
-- drop policy if exists "icp admin write" on ideal_customer_profile;
-- drop policy if exists "icp admin update" on ideal_customer_profile;
-- drop policy if exists "icp admin delete" on ideal_customer_profile;
-- drop policy if exists "scoring rules select all" on lead_scoring_rules;
-- drop policy if exists "scoring rules admin write" on lead_scoring_rules;
-- drop policy if exists "scoring rules admin update" on lead_scoring_rules;
-- drop policy if exists "scoring rules admin delete" on lead_scoring_rules;
-- drop policy if exists "objection playbook select all" on objection_playbook;
-- drop policy if exists "objection playbook admin write" on objection_playbook;
-- drop policy if exists "objection playbook admin update" on objection_playbook;
-- drop policy if exists "objection playbook admin delete" on objection_playbook;
-- drop policy if exists "activity targets select own or admin" on sales_activity_targets;
-- drop policy if exists "activity targets admin write" on sales_activity_targets;
-- drop policy if exists "activity targets admin update" on sales_activity_targets;
-- drop policy if exists "activity targets admin delete" on sales_activity_targets;
-- drop policy if exists "forecast log select own or admin" on forecast_log;
-- drop policy if exists "forecast log write own or admin" on forecast_log;
-- drop policy if exists "forecast log update own or admin" on forecast_log;
-- drop policy if exists "forecast log delete own or admin" on forecast_log;
-- drop policy if exists "win loss select own or admin" on win_loss_analysis;
-- drop policy if exists "win loss write own or admin" on win_loss_analysis;
-- drop policy if exists "win loss update own or admin" on win_loss_analysis;
-- drop policy if exists "win loss delete own or admin" on win_loss_analysis;
-- drop function if exists is_admin();
