-- decision_pull_dispatch_eliminated_2026-08-04: the courier-combo-tick cron
-- (20260618_003) exists solely to nudge couriers toward self-pickup combos
-- in the open pool. Self-pickup is now removed (acceptOrderAction no longer
-- has an open-pool claim branch; both self-pickup API routes return 410), so
-- a combo push would invite an action that always fails. Unschedule the cron.
--
-- Leaves the courier_combo_pushes table and the courier-combo-tick Edge
-- Function in place (audit trail + reusable if combo suggestions come back
-- as a system-pushed offer instead of a self-pick) — this migration only
-- stops the tick.
--
-- Idempotent: no-ops if the job was already removed/renamed.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'courier-combo-tick';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end$$;
