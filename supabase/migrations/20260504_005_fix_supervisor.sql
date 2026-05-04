-- HIR Restaurant Suite — Fix Agent + Supervisor Agent (Phase 3 + 4)
--
-- Adds the schema needed by the fix-attempt + supervise-fix Edge Functions:
--   - code_chunks       : pgvector RAG over the real repo (apps/restaurant-admin
--                         and apps/restaurant-web only — never courier).
--   - fix_attempts      : every Fix Agent run + supervisor verdict.
--   - code_chunks_index_runs : audit log for the indexer cron.
--
-- Also defensively ensures:
--   - feedback_reports.triage_routed_to_fix column exists (Phase 2 sets it true).
--   - agent_trust_calibration row for fix-attempt + supervise-fix (default
--     PROPOSE_ONLY) so Phase 4 has a row to read.
--
-- Migration is ADDITIVE ONLY. Idempotent. Service-role-only RLS.
--
-- Phase 1 reference: 20260504_001_feedback_intake.sql
-- Architecture: FEEDBACK_LOOP_ARCHITECTURE.md § Phase 3 + § Phase 4

create extension if not exists vector with schema extensions;

-- ============================================================
-- 1. feedback_reports — defensive column add (Phase 2 sets this)
-- ============================================================
alter table public.feedback_reports
  add column if not exists triage_routed_to_fix boolean not null default false;

create index if not exists idx_feedback_reports_routed_to_fix
  on public.feedback_reports(triage_routed_to_fix, status)
  where triage_routed_to_fix = true;

-- ============================================================
-- 2. code_chunks — pgvector RAG store
-- ============================================================
create table if not exists public.code_chunks (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  chunk_index int not null,
  chunk_text text not null,
  embedding extensions.vector(1536),
  fts tsvector generated always as (to_tsvector('simple', chunk_text)) stored,
  app text check (app in ('restaurant-admin','restaurant-web','shared')),
  committed_sha text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_code_chunks_path_idx_sha
  on public.code_chunks(file_path, chunk_index, committed_sha);

create index if not exists idx_code_chunks_app
  on public.code_chunks(app);

create index if not exists idx_code_chunks_fts
  on public.code_chunks using gin(fts);

-- HNSW only created when a row with embedding exists; safe to create empty.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_code_chunks_embedding_hnsw'
  ) then
    execute 'create index idx_code_chunks_embedding_hnsw '
         || 'on public.code_chunks using hnsw (embedding extensions.vector_cosine_ops)';
  end if;
exception when others then
  -- Older Postgres / pgvector without HNSW support: fall back to ivfflat.
  begin
    execute 'create index if not exists idx_code_chunks_embedding_ivf '
         || 'on public.code_chunks using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100)';
  exception when others then
    null;  -- will rely on FTS fallback only.
  end;
end$$;

alter table public.code_chunks enable row level security;

drop policy if exists code_chunks_service_only on public.code_chunks;
create policy code_chunks_service_only
  on public.code_chunks
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 3. code_chunks_index_runs — indexer audit log
-- ============================================================
create table if not exists public.code_chunks_index_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  chunks_added int not null default 0,
  chunks_updated int not null default 0,
  chunks_skipped int not null default 0,
  head_sha text,
  status text not null default 'RUNNING' check (status in ('RUNNING','OK','FAILED')),
  error_text text
);

alter table public.code_chunks_index_runs enable row level security;

drop policy if exists code_chunks_index_runs_service_only on public.code_chunks_index_runs;
create policy code_chunks_index_runs_service_only
  on public.code_chunks_index_runs
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 4. fix_attempts — Fix Agent runs + Supervisor verdict
-- ============================================================
create table if not exists public.fix_attempts (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid references public.feedback_reports(id) on delete cascade,
  branch_name text,
  pr_number int,
  pr_url text,
  diff_lines_added int default 0,
  diff_lines_removed int default 0,
  files_touched text[] default '{}',
  commit_message text,
  agent_response_raw jsonb,
  cost_usd numeric(10,4) default 0,
  status text not null default 'PROPOSED' check (status in (
    'PROPOSED','SUPERVISED','REJECTED','MERGED','REVERTED','FAILED'
  )),
  rejection_reason text,
  supervisor_score int,
  supervisor_decision text check (supervisor_decision in ('AUTO_MERGE','PROPOSE','REJECT')),
  supervisor_reasoning text,
  supervisor_guardrails_passed text[],
  supervisor_guardrails_failed text[],
  supervisor_response_raw jsonb,
  supervisor_cost_usd numeric(10,4) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fix_attempts_feedback
  on public.fix_attempts(feedback_id, created_at desc);
create index if not exists idx_fix_attempts_status
  on public.fix_attempts(status, created_at desc);
create index if not exists idx_fix_attempts_pr_number
  on public.fix_attempts(pr_number) where pr_number is not null;

create or replace function public.fix_attempts_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_fix_attempts_updated_at on public.fix_attempts;
create trigger trg_fix_attempts_updated_at
  before update on public.fix_attempts
  for each row execute function public.fix_attempts_set_updated_at();

alter table public.fix_attempts enable row level security;

drop policy if exists fix_attempts_service_only on public.fix_attempts;
create policy fix_attempts_service_only
  on public.fix_attempts
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 5. agent_trust_calibration — defensive create + seed
--    Phase 2 may ship its own version; this is no-op if already present.
-- ============================================================
create table if not exists public.agent_trust_calibration (
  agent_name text primary key,
  trust_level text not null default 'PROPOSE_ONLY' check (trust_level in (
    'OFF','PROPOSE_ONLY','AUTO_REVERSIBLE','AUTO_FULL'
  )),
  successful_runs int not null default 0,
  failed_runs int not null default 0,
  rollbacks int not null default 0,
  last_action_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_trust_calibration enable row level security;

drop policy if exists agent_trust_calibration_service_only on public.agent_trust_calibration;
create policy agent_trust_calibration_service_only
  on public.agent_trust_calibration
  for all
  to service_role
  using (true)
  with check (true);

insert into public.agent_trust_calibration (agent_name, trust_level, notes) values
  ('fix-attempt',   'PROPOSE_ONLY', 'Default — Iulian ratchets up after 10 successful PROPOSE merges.'),
  ('supervise-fix', 'AUTO_FULL',    'Always decides — guardrails internal.')
on conflict (agent_name) do nothing;

-- ============================================================
-- 6. Trigger: feedback_reports → fix-attempt Edge Function
--    Fires when Triage marks a row routed to fix.
-- ============================================================
create or replace function public.fn_dispatch_fix_attempt()
returns trigger language plpgsql security definer as $$
declare
  v_url   text;
  v_token text;
begin
  if new.triage_routed_to_fix is distinct from true then
    return new;
  end if;
  if new.status <> 'TRIAGED' then
    return new;
  end if;
  -- Avoid re-dispatch when a fix_attempt already exists.
  if exists (select 1 from public.fix_attempts where feedback_id = new.id) then
    return new;
  end if;

  v_url := current_setting('app.supabase_functions_url', true);
  if v_url is null or v_url = '' then
    v_url := 'https://qfmeojeipncuxeltnvab.functions.supabase.co';
  end if;
  v_token := current_setting('app.supabase_service_role_key', true);

  begin
    perform net.http_post(
      url     := v_url || '/fix-attempt',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || coalesce(v_token,'')
      ),
      body    := jsonb_build_object('feedback_id', new.id)
    );
  exception when others then
    -- Never block the parent INSERT/UPDATE on dispatch failure.
    raise notice 'fn_dispatch_fix_attempt: net.http_post failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_dispatch_fix_attempt_ins on public.feedback_reports;
create trigger trg_dispatch_fix_attempt_ins
  after insert on public.feedback_reports
  for each row execute function public.fn_dispatch_fix_attempt();

drop trigger if exists trg_dispatch_fix_attempt_upd on public.feedback_reports;
create trigger trg_dispatch_fix_attempt_upd
  after update of triage_routed_to_fix, status on public.feedback_reports
  for each row execute function public.fn_dispatch_fix_attempt();

-- ============================================================
-- 7. Trigger: fix_attempts insert → supervise-fix Edge Function
-- ============================================================
create or replace function public.fn_dispatch_supervise_fix()
returns trigger language plpgsql security definer as $$
declare
  v_url   text;
  v_token text;
begin
  if new.status <> 'PROPOSED' then
    return new;
  end if;
  if new.pr_number is null then
    return new;
  end if;

  v_url := current_setting('app.supabase_functions_url', true);
  if v_url is null or v_url = '' then
    v_url := 'https://qfmeojeipncuxeltnvab.functions.supabase.co';
  end if;
  v_token := current_setting('app.supabase_service_role_key', true);

  begin
    perform net.http_post(
      url     := v_url || '/supervise-fix',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || coalesce(v_token,'')
      ),
      body    := jsonb_build_object('fix_attempt_id', new.id)
    );
  exception when others then
    raise notice 'fn_dispatch_supervise_fix: net.http_post failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_dispatch_supervise_fix on public.fix_attempts;
create trigger trg_dispatch_supervise_fix
  after insert on public.fix_attempts
  for each row execute function public.fn_dispatch_supervise_fix();

-- ============================================================
-- 8. RPC: top-K code chunks for a query (cosine + FTS fallback)
-- ============================================================
create or replace function public.search_code_chunks(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_app_filter text default null,
  p_limit int default 5
)
returns table(
  id uuid,
  file_path text,
  chunk_index int,
  chunk_text text,
  app text,
  score numeric
) language plpgsql security definer as $$
begin
  if p_query_embedding is not null then
    return query
    select c.id, c.file_path, c.chunk_index, c.chunk_text, c.app,
           (1 - (c.embedding <=> p_query_embedding))::numeric as score
    from public.code_chunks c
    where c.embedding is not null
      and (p_app_filter is null or c.app = p_app_filter or c.app = 'shared')
    order by c.embedding <=> p_query_embedding asc
    limit greatest(p_limit, 1);
  else
    return query
    select c.id, c.file_path, c.chunk_index, c.chunk_text, c.app,
           ts_rank(c.fts, plainto_tsquery('simple', coalesce(p_query_text,'')))::numeric as score
    from public.code_chunks c
    where (p_app_filter is null or c.app = p_app_filter or c.app = 'shared')
      and c.fts @@ plainto_tsquery('simple', coalesce(p_query_text,''))
    order by score desc
    limit greatest(p_limit, 1);
  end if;
end;
$$;

grant execute on function public.search_code_chunks(extensions.vector, text, text, int) to service_role;

-- ============================================================
-- end migration
-- ============================================================
