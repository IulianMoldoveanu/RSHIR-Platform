-- HIR Restaurant Suite — Lane S: audit log chain hardening (STAGED)
--
-- Purpose: tamper-evident hash chain over public.audit_log.
--   - Each new row stores prev_hash (the row_hash of the latest existing row at insert time)
--     and row_hash = sha256(prev_hash || canonical_json(NEW)).
--   - Verifier function walks any range and reports the first id where the recomputed
--     hash differs from the stored hash.
--
-- STAGING NOTES (per Lane S charter):
--   - Columns are nullable. Existing rows stay at NULL prev_hash/row_hash; trigger only
--     hardens NEW inserts. Backfill is OUT OF SCOPE for this migration.
--   - Trigger BEFORE INSERT — present in this file but NOT activated on prod by this
--     migration's mere existence. Activation happens when the file is applied via
--     `scripts/post-merge/setup-audit-chain.mjs` (manual, after Iulian sign-off).
--   - No pg_cron schedule, no automatic verifier run, no alerting wiring at DB layer.
--
-- Idempotent: safe to re-apply.

-- ============================================================
-- 1. Additive columns
-- ============================================================
alter table public.audit_log
  add column if not exists prev_hash text,
  add column if not exists row_hash  text;

create index if not exists audit_log_row_hash_idx
  on public.audit_log (row_hash);

-- ============================================================
-- 2. Helper: canonical JSON for hashing
-- ============================================================
-- We must hash a stable representation of the row. Postgres jsonb sorts object
-- keys lexicographically when cast via jsonb_build_object, but to be deterministic
-- we serialize only the immutable identifying fields explicitly.
create or replace function public.audit_log_canonical_payload(
  p_id           uuid,
  p_tenant_id    uuid,
  p_actor        uuid,
  p_action       text,
  p_entity_type  text,
  p_entity_id    text,
  p_metadata     jsonb,
  p_created_at   timestamptz
)
returns text
language sql
immutable
as $$
  select concat_ws(
    '|',
    coalesce(p_id::text, ''),
    coalesce(p_tenant_id::text, ''),
    coalesce(p_actor::text, ''),
    coalesce(p_action, ''),
    coalesce(p_entity_type, ''),
    coalesce(p_entity_id, ''),
    coalesce(p_metadata::text, ''),
    coalesce(to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '')
  );
$$;

-- ============================================================
-- 3. Trigger function — compute prev_hash + row_hash before insert
-- ============================================================
create or replace function public.audit_log_compute_hash()
returns trigger
language plpgsql
as $$
declare
  v_prev_hash text;
  v_payload   text;
begin
  -- Serialize concurrent inserts so the chain stays linear.
  -- `for update` on the latest row pins it until this transaction commits.
  -- If table is empty, v_prev_hash stays NULL → genesis row.
  select row_hash into v_prev_hash
  from public.audit_log
  order by created_at desc, id desc
  limit 1
  for update;

  new.prev_hash := v_prev_hash;

  v_payload := public.audit_log_canonical_payload(
    new.id,
    new.tenant_id,
    new.actor_user_id,
    new.action,
    new.entity_type,
    new.entity_id,
    new.metadata,
    coalesce(new.created_at, now())
  );

  new.row_hash := encode(
    digest(coalesce(v_prev_hash, '') || '||' || v_payload, 'sha256'),
    'hex'
  );

  return new;
end;
$$;

-- pgcrypto provides digest(); ensure available.
create extension if not exists pgcrypto;

-- Drop+recreate trigger (CREATE TRIGGER IF NOT EXISTS not supported on all versions).
drop trigger if exists trg_audit_log_chain on public.audit_log;
create trigger trg_audit_log_chain
  before insert on public.audit_log
  for each row
  execute function public.audit_log_compute_hash();

-- ============================================================
-- 4. Verifier — walk any range, return first mismatch (or none)
-- ============================================================
-- Returns one row per mismatch encountered with the recomputed expected hash
-- alongside the stored hash. Empty result = chain intact across the range.
-- p_start / p_end bounds are inclusive on created_at; pass NULLs to mean -inf/+inf.
create or replace function public.audit_log_verify_chain(
  p_start timestamptz default null,
  p_end   timestamptz default null
)
returns table(
  row_id        uuid,
  created_at    timestamptz,
  expected_hash text,
  stored_hash   text,
  prev_hash     text
)
language plpgsql
stable
as $$
declare
  r           record;
  v_prev      text := null;
  v_first     boolean := true;
  v_expected  text;
begin
  for r in
    select id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata,
           created_at, prev_hash, row_hash
    from public.audit_log
    where (p_start is null or created_at >= p_start)
      and (p_end   is null or created_at <= p_end)
    order by created_at asc, id asc
  loop
    -- For the first row in the range we trust the stored prev_hash as anchor;
    -- mismatches inside the range are still detected via row_hash comparison.
    if v_first then
      v_prev := r.prev_hash;
      v_first := false;
    end if;

    v_expected := encode(
      digest(
        coalesce(v_prev, '') || '||' ||
        public.audit_log_canonical_payload(
          r.id, r.tenant_id, r.actor_user_id, r.action,
          r.entity_type, r.entity_id, r.metadata, r.created_at
        ),
        'sha256'
      ),
      'hex'
    );

    -- Only emit rows that actually carry a stored row_hash (i.e. inserted
    -- AFTER the trigger was activated). Pre-trigger rows have row_hash = NULL
    -- and are out-of-scope for this verifier.
    if r.row_hash is not null and v_expected <> r.row_hash then
      row_id        := r.id;
      created_at    := r.created_at;
      expected_hash := v_expected;
      stored_hash   := r.row_hash;
      prev_hash     := r.prev_hash;
      return next;
    end if;

    -- Advance the chain using the STORED hash (not expected) so a single
    -- mismatch doesn't cascade and hide every downstream row.
    v_prev := r.row_hash;
  end loop;
  return;
end;
$$;

-- ============================================================
-- 5. Tracking table for verifier runs (read-only by platform_admin)
-- ============================================================
create table if not exists public.audit_log_verifier_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  range_start  timestamptz,
  range_end    timestamptz,
  mismatches   integer not null default 0,
  triggered_by text -- email of platform_admin who pressed "Run now", or 'cron'
);

create index if not exists audit_log_verifier_runs_started_idx
  on public.audit_log_verifier_runs (started_at desc);

alter table public.audit_log_verifier_runs enable row level security;
-- No SELECT policy — service role reads via admin client only.

-- ============================================================
-- 6. Permissions
-- ============================================================
revoke all on function public.audit_log_compute_hash()             from public;
revoke all on function public.audit_log_canonical_payload(uuid, uuid, uuid, text, text, text, jsonb, timestamptz) from public;
revoke all on function public.audit_log_verify_chain(timestamptz, timestamptz) from public;

-- Service role can do everything; nothing else needs direct call.
grant execute on function public.audit_log_verify_chain(timestamptz, timestamptz) to service_role;
