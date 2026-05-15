-- F6 RSHIR self-improving loop — RAG retrieval over historical agent runs.
--
-- Adds a pgvector embedding column + ANN index on `copilot_agent_runs` so the
-- master orchestrator can retrieve top-K similar prior runs per (tenant,
-- intent, payload) and pass them as `prior` examples into agent plan() calls.
--
-- Pattern mirrors 20260504_005_fix_supervisor.sql (code_chunks):
--   - extensions.vector(1536), text-embedding-3-small dimensionality
--   - HNSW preferred, ivfflat fallback inside DO block
--   - additive, idempotent, NOT applied to prod from this PR
--
-- A SECURITY DEFINER RPC `match_agent_runs` returns the top-K nearest
-- EXECUTED rows for a tenant. Routed through SECURITY DEFINER because the
-- master-orchestrator dispatch path runs as service_role from Edge Functions
-- and we want the lookup to be a single round-trip.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Embedding column on copilot_agent_runs
-- ---------------------------------------------------------------------------

alter table public.copilot_agent_runs
  add column if not exists embedding extensions.vector(1536);

-- The embedded text source. Lets us re-embed in bulk later without parsing
-- payload jsonb again. Free-form; built as `intent + ' ' + payload_json`
-- by the orchestrator.
alter table public.copilot_agent_runs
  add column if not exists embedding_source text;

alter table public.copilot_agent_runs
  add column if not exists embedded_at timestamptz;

-- HNSW only created when the pgvector build supports it; fall back to
-- ivfflat. Either is fine for our N (~thousands of rows per tenant).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'idx_copilot_agent_runs_embedding_hnsw'
  ) then
    execute 'create index idx_copilot_agent_runs_embedding_hnsw '
         || 'on public.copilot_agent_runs using hnsw '
         || '(embedding extensions.vector_cosine_ops) '
         || 'where embedding is not null and state = ''EXECUTED''';
  end if;
exception when others then
  begin
    execute 'create index if not exists idx_copilot_agent_runs_embedding_ivf '
         || 'on public.copilot_agent_runs using ivfflat '
         || '(embedding extensions.vector_cosine_ops) with (lists = 100)';
  exception when others then
    null;  -- platform without HNSW or ivfflat support; retrieval becomes a no-op.
  end;
end$$;

-- ---------------------------------------------------------------------------
-- 2. match_agent_runs RPC — top-K nearest EXECUTED rows for a tenant
-- ---------------------------------------------------------------------------

create or replace function public.match_agent_runs(
  p_tenant_id uuid,
  p_query_embedding extensions.vector(1536),
  p_k int default 5,
  p_agent_name text default null
)
returns table (
  id uuid,
  agent_name text,
  action_type text,
  summary text,
  payload jsonb,
  similarity double precision,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    r.id,
    r.agent_name,
    r.action_type,
    r.summary,
    r.payload,
    -- cosine similarity: 1 - cosine_distance. Higher = more similar.
    (1 - (r.embedding <=> p_query_embedding))::double precision as similarity,
    r.created_at
  from public.copilot_agent_runs r
  where r.restaurant_id = p_tenant_id
    and r.state = 'EXECUTED'
    and r.embedding is not null
    and (p_agent_name is null or r.agent_name = p_agent_name)
  order by r.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_k, 5), 25));
$$;

revoke all on function public.match_agent_runs(uuid, extensions.vector, int, text) from public;
grant execute on function public.match_agent_runs(uuid, extensions.vector, int, text) to service_role;
