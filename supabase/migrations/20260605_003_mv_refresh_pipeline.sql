-- Lane X — Materialized view refresh pipeline + audit log.
--
-- Audit goal: every dashboard tile that reads a materialized view should be
-- backed by a refresh that is (a) scheduled, (b) logged, (c) recoverable.
--
-- Inventory at write time (2026-05-05): only one MV exists in public schema —
-- `mv_growth_tenant_metrics_30d` (Phase 5 Growth Agent). It already has a
-- unique index `ux_mv_growth_tenant_metrics_30d_tenant` so CONCURRENTLY works,
-- and cron job `refresh-growth-mv-daily` (jobid 10) refreshes it at 05:55 UTC.
--
-- This migration adds the infrastructure (audit table + logged-refresh
-- function + observability view) so any future MV plugs in with one line:
--   select public.refresh_mv_logged('public', 'mv_my_new_view');
-- and shows up automatically in the admin observability page.
--
-- Idempotent / additive only.

-- ============================================================
-- TABLE: mv_refresh_log
-- ============================================================
create table if not exists public.mv_refresh_log (
  id          bigserial primary key,
  mv_schema   text        not null default 'public',
  mv_name     text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms bigint,
  row_count_after bigint,
  concurrent  boolean     not null default true,
  error       text
);

create index if not exists idx_mv_refresh_log_mv_started
  on public.mv_refresh_log (mv_schema, mv_name, started_at desc);

create index if not exists idx_mv_refresh_log_started
  on public.mv_refresh_log (started_at desc);

alter table public.mv_refresh_log enable row level security;

-- Platform admins read all; nobody else.
drop policy if exists mv_refresh_log_platform_admin_read on public.mv_refresh_log;
create policy mv_refresh_log_platform_admin_read
  on public.mv_refresh_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins pa
      where pa.user_id = auth.uid()
    )
  );

-- Service role writes via the function below; no insert/update policy for
-- regular users (RLS denies by default).

-- ============================================================
-- FUNCTION: refresh_mv_logged(schema, name, concurrent)
-- ============================================================
-- Wraps REFRESH MATERIALIZED VIEW [CONCURRENTLY]. Always logs duration +
-- row_count_after; on error, logs error text (never raises so cron job
-- doesn't go inactive after a transient failure).
create or replace function public.refresh_mv_logged(
  p_schema text,
  p_name   text,
  p_concurrent boolean default true
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_log_id   bigint;
  v_started  timestamptz := clock_timestamp();
  v_finished timestamptz;
  v_rows     bigint;
  v_kind     char;
begin
  -- Validate target exists and is a materialized view (relkind='m').
  select c.relkind into v_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = p_schema and c.relname = p_name;

  if v_kind is null then
    insert into public.mv_refresh_log
      (mv_schema, mv_name, started_at, finished_at, duration_ms, concurrent, error)
    values
      (p_schema, p_name, v_started, clock_timestamp(),
       extract(milliseconds from (clock_timestamp() - v_started))::bigint,
       p_concurrent, format('not found: %I.%I', p_schema, p_name));
    return;
  elsif v_kind <> 'm' then
    insert into public.mv_refresh_log
      (mv_schema, mv_name, started_at, finished_at, duration_ms, concurrent, error)
    values
      (p_schema, p_name, v_started, clock_timestamp(),
       extract(milliseconds from (clock_timestamp() - v_started))::bigint,
       p_concurrent, format('not a materialized view (relkind=%s)', v_kind));
    return;
  end if;

  insert into public.mv_refresh_log (mv_schema, mv_name, started_at, concurrent)
  values (p_schema, p_name, v_started, p_concurrent)
  returning id into v_log_id;

  begin
    if p_concurrent then
      execute format('refresh materialized view concurrently %I.%I', p_schema, p_name);
    else
      execute format('refresh materialized view %I.%I', p_schema, p_name);
    end if;

    execute format('select count(*) from %I.%I', p_schema, p_name) into v_rows;

    v_finished := clock_timestamp();
    update public.mv_refresh_log
       set finished_at     = v_finished,
           duration_ms     = extract(milliseconds from (v_finished - v_started))::bigint,
           row_count_after = v_rows
     where id = v_log_id;

  exception when others then
    v_finished := clock_timestamp();
    update public.mv_refresh_log
       set finished_at = v_finished,
           duration_ms = extract(milliseconds from (v_finished - v_started))::bigint,
           error       = sqlerrm
     where id = v_log_id;
    -- swallow: cron job stays active; admin page surfaces error.
  end;
end;
$$;

revoke all on function public.refresh_mv_logged(text, text, boolean) from public;
grant execute on function public.refresh_mv_logged(text, text, boolean) to service_role;
-- pg_cron jobs run as the job creator (typically postgres); explicit grant
-- not needed there but harmless.

-- ============================================================
-- VIEW: v_mv_refresh_status
-- ============================================================
-- One row per known materialized view with last refresh metadata.
-- Driven by pg_matviews so a brand new MV shows up automatically (with
-- last_refresh_at = null until something logs it).
create or replace view public.v_mv_refresh_status as
with last_runs as (
  select distinct on (mv_schema, mv_name)
         mv_schema,
         mv_name,
         started_at      as last_started_at,
         finished_at     as last_finished_at,
         duration_ms     as last_duration_ms,
         row_count_after as last_row_count,
         error           as last_error
    from public.mv_refresh_log
   order by mv_schema, mv_name, started_at desc
),
agg7d as (
  select mv_schema,
         mv_name,
         count(*)                                  as runs_7d,
         count(*) filter (where error is not null) as errors_7d,
         avg(duration_ms)::bigint                  as avg_duration_ms_7d,
         max(duration_ms)                          as max_duration_ms_7d
    from public.mv_refresh_log
   where started_at > now() - interval '7 days'
   group by mv_schema, mv_name
)
select m.schemaname                                       as mv_schema,
       m.matviewname                                      as mv_name,
       pg_size_pretty(pg_total_relation_size(format('%I.%I', m.schemaname, m.matviewname)::regclass))
                                                          as size_pretty,
       pg_total_relation_size(format('%I.%I', m.schemaname, m.matviewname)::regclass)
                                                          as size_bytes,
       lr.last_started_at,
       lr.last_finished_at,
       lr.last_duration_ms,
       lr.last_row_count,
       lr.last_error,
       coalesce(a.runs_7d, 0)   as runs_7d,
       coalesce(a.errors_7d, 0) as errors_7d,
       a.avg_duration_ms_7d,
       a.max_duration_ms_7d,
       exists (
         select 1
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           join pg_index ix    on ix.indrelid = c.oid
          where n.nspname = m.schemaname
            and c.relname = m.matviewname
            and ix.indisunique
       ) as has_unique_index
  from pg_matviews m
  left join last_runs lr
    on lr.mv_schema = m.schemaname and lr.mv_name = m.matviewname
  left join agg7d a
    on a.mv_schema = m.schemaname and a.mv_name = m.matviewname
 where m.schemaname = 'public'
 order by m.matviewname;

grant select on public.v_mv_refresh_status to service_role;

-- ============================================================
-- CRON: rewire existing growth MV refresh to go through the logger.
-- ============================================================
-- The previous job 10 calls REFRESH MATERIALIZED VIEW CONCURRENTLY directly.
-- Switching it to refresh_mv_logged() so we get duration + row_count + error
-- history without changing the schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-growth-mv-daily') then
    perform cron.unschedule('refresh-growth-mv-daily');
  end if;
  perform cron.schedule(
    'refresh-growth-mv-daily',
    '55 5 * * *',
    $cron$ select public.refresh_mv_logged('public', 'mv_growth_tenant_metrics_30d', true); $cron$
  );
exception when undefined_table then
  -- pg_cron not enabled in this environment (e.g. local) — skip silently.
  null;
end $$;
