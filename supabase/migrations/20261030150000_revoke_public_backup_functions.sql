-- Backup helpers must not be callable from the public REST API.
-- pg_cron runs trigger_daily_backup() as postgres, so scheduled backups are unaffected.
revoke execute on function public.trigger_daily_backup() from public, anon, authenticated;
revoke execute on function public.list_backup_tables() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.trigger_daily_backup() to service_role;
grant execute on function public.list_backup_tables() to service_role;
grant execute on function public.rls_auto_enable() to service_role;
