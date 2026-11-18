-- Retention for the three log tables that nothing ever pruned.
--
-- WHY, measured 2026-11-18 after a Supabase "Disk IO Budget depletion" alert:
--
--   The single largest disk reader in the whole database was not a query the
--   product runs. It was pg_cron's own restart recovery:
--
--     update cron.job_run_details set status = $1, return_message = $2
--      where status in ($3,$4)
--     3 calls | 408,179 blocks read from disk | 13 cache hits
--
--   pg_cron runs that on startup to mark jobs orphaned by a restart. There is
--   no index on `status`, so it scans the entire table -- which had grown to
--   1152 MB of a 2177 MB database (53%), 1.35M rows since 25 April, because
--   none of the 37 scheduled jobs pruned it. The project was paused 22 Oct to
--   13 Nov (expired plan) and every restart burned ~1 GB of reads.
--
--   Two application tables had the same disease, though `seq_scan = 0` on both
--   so they cost space rather than IO:
--     public.github_pr_events  629 MB (571 MB of it TOAST'd raw_payload)
--     public.function_runs     297 MB
--
--   Retention windows chosen from what the readers actually ask for:
--     function_runs    -- every reader uses a 24h window or `order by
--                         started_at desc limit N`. 30 days matches the house
--                         pattern (courier-gps-dpa-30day-purge et al).
--     github_pr_events -- /status in telegram-command-intake reads 24h of thin
--                         columns; 90 days keeps a quarter of history for ~20 MB.
--     raw_payload      -- read only by triage-github-event, seconds after the
--                         webhook insert. 7 days is the debugging margin, and
--                         it is what reclaims 571 of the 629 MB. An untriaged
--                         CRITICAL/WARN keeps its payload so it can be retried.
--
-- The one-time cleanup was done out of band, not here, and NOT with a batched
-- delete: cron.job_run_details has exactly one index (pkey on runid) and none
-- on start_time, so `where start_time < ...` scans the whole table per batch --
-- ~8 GB of reads to settle a disk-IO alert. What was used instead: binary
-- search the cutoff runid through the pkey (20 index lookups), take an ACCESS
-- EXCLUSIVE lock FIRST, copy the keepers, TRUNCATE (returns the disk at commit,
-- no VACUUM FULL), reinsert. Result: 2177 MB -> 298 MB.
--
-- No index was added on job_run_details(status) or (start_time) on purpose: the
-- table is now capped near 46 MB, so the restart scan costs ~6k blocks, and an
-- index would tax ~12,400 inserts a day to save one scan per restart.
--
-- cron.schedule() upserts by jobname, so this file is idempotent.

-- 03:40 -- the slots at 03:15 and 03:30 are taken by existing retention jobs.
select cron.schedule(
  'cron-log-prune-daily',
  '40 3 * * *',
  $job$delete from cron.job_run_details where start_time < now() - interval '7 days'$job$
);

select cron.schedule(
  'github-events-retention-daily',
  '45 3 * * *',
  $job$
    delete from public.github_pr_events where created_at < now() - interval '90 days';
    update public.github_pr_events set raw_payload = null
     where created_at < now() - interval '7 days'
       and raw_payload is not null
       and not (severity in ('CRITICAL','WARN') and triage_at is null);
  $job$
);

select cron.schedule(
  'function-runs-retention-daily',
  '50 3 * * *',
  $job$delete from public.function_runs where started_at < now() - interval '30 days'$job$
);
