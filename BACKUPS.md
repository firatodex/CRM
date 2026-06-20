# OpsCraft CRM — Automated Backups

## What this is

Every day at 2:00 AM IST, a Supabase Edge Function (`daily-backup`) exports
all CRM data into a single JSON file and stores it in Supabase Storage,
in a bucket called `crm-backups` — separate from the live database tables.

This protects against: accidental data deletion, a bad migration, or any
issue with the live tables. It does **not** protect against Supabase itself
being unavailable, since Storage lives on the same platform. A future
upgrade (see below) will mirror backups to Google Drive for true off-platform
redundancy.

## What's backed up

- `clients` — every lead/client record
- `contact_log` — every call/WhatsApp/email log entry
- `tasks` — all tasks (demo, proposal, reminder, custom)
- `pipeline_snapshots` — the frozen daily reserve-gauge history

## How it works

1. `pg_cron` (inside Postgres) runs `trigger_daily_backup()` once a day at
   20:30 UTC (2:00 AM IST).
2. That function calls the `daily-backup` Edge Function via `pg_net`,
   passing a shared secret header for authorization (the function isn't
   publicly callable without it).
3. The Edge Function reads every row from each table (paginated, so it's
   safe even as tables grow past 1000 rows), bundles it into one JSON file
   named `backup-YYYY-MM-DD.json`, and uploads it to the `crm-backups`
   bucket.
4. Backups older than 90 days are automatically deleted to keep storage
   usage bounded — 90 daily snapshots is a generous recovery window.

## How to retrieve a backup

Via Supabase Dashboard:
1. Go to your project → Storage → `crm-backups` bucket
2. Download the relevant `backup-YYYY-MM-DD.json` file

Via SQL (to list available backups):
```sql
select name, created_at, metadata->>'size' as size_bytes
from storage.objects
where bucket_id = 'crm-backups'
order by created_at desc;
```

## How to restore from a backup (manual, by design)

Restoring is intentionally **not automated** — a bad automatic restore could
overwrite good current data. If you ever need to restore:

1. Download the backup JSON file.
2. Each table's data is under `tables.<table_name>` as an array of rows.
3. For each row, the `id` field is the same UUID that existed in the
   original table — re-inserting with that same `id` will restore the
   exact record (use `upsert` if some rows may already exist).
4. This should be done carefully, ideally by asking Claude to write and
   review the exact restore SQL for the specific situation, rather than
   running a blanket script — context matters (e.g., was this a full data
   loss, or just a few records?).

## Manually triggering a backup (outside the daily schedule)

```sql
select public.trigger_daily_backup();
```

This fires the same backup process immediately. Useful before a risky
migration or change, as an extra safety snapshot.

## Future upgrade: Google Drive mirroring

Currently backups stay within Supabase Storage. A future version should
also push a copy to Google Drive for true off-platform redundancy — this
requires setting up a Google service account (not just a personal OAuth
connection, since the backup runs unattended) for the Edge Function to
authenticate with. Revisit when ready.
