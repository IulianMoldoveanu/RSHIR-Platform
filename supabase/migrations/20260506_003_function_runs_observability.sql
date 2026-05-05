-- Lane 9 — Edge Function observability ledger.
--
-- Single platform-telemetry table: every wrapped Edge Function logs a row
-- on entry (status=RUNNING) and updates it on exit (SUCCESS / ERROR) with
-- duration + optional error_text + free-form metadata.
--
-- Read access is platform-admin only (allow-list checked in the Next.js
-- page via HIR_PLATFORM_ADMIN_EMAILS — same gate the materialized-views
-- page uses). Writes go via service-role from the Edge Functions; we deny
-- everything to authenticated/anon at the RLS layer to be safe.
--
-- Fully additive + idempotent.

create table if not exists public.function_runs (
  id            uuid primary key default gen_random_uuid(),
  function_name text not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_ms   integer generated always as (
    case
      when ended_at is null then null
      else (extract(epoch from (ended_at - started_at)) * 1000)::integer
    end
  ) stored,
  status        text not null default 'RUNNING'
                check (status in ('RUNNING', 'SUCCESS', 'ERROR')),
  error_text    text,
  metadata      jsonb not null default '{}'::jsonb,
  tenant_id     uuid
);

create index if not exists idx_function_runs_name_started
  on public.function_runs (function_name, started_at desc);

create index if not exists idx_function_runs_status_started
  on public.function_runs (status, started_at desc);

alter table public.function_runs enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated or anon. The
-- Next.js admin page reads via the service-role admin client (same
-- pattern as v_mv_refresh_status / mv_refresh_log). Edge Functions also
-- write via service-role. RLS is enabled to deny everything by default
-- if anyone ever attempts a direct PostgREST hit with anon/authenticated.

comment on table public.function_runs is
  'Lane 9 observability — one row per Edge Function invocation. Platform telemetry only. Read via service-role from /dashboard/admin/observability/function-runs.';
