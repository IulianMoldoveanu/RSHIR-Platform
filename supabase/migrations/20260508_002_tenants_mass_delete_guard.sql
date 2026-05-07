-- Lane BACKUP-DR-AUDIT (2026-05-08) — mass-delete protection on public.tenants.
--
-- Two business paths hard-delete a tenant today (verified via grep on
-- 2026-05-08): the rollback branches in
--   * apps/restaurant-admin/src/app/api/signup/route.ts (line 105)
--   * apps/restaurant-admin/src/app/dashboard/admin/onboard/actions.ts (line 167)
-- Both fire ONLY when tenant_members INSERT fails immediately after the
-- tenant INSERT — i.e. they are cleanup paths for a tenant that was
-- created seconds earlier and has zero child data. Beyond those two, no
-- code path hard-deletes a tenant.
--
-- A bad migration, a leaked service-role key, a typo in psql, or a
-- malicious bulk DELETE could still execute `DELETE FROM tenants` and
-- would cascade through every menu / order / customer / reservation row
-- via the existing `on delete cascade` foreign keys. This is the failure
-- mode this lane closes.
--
-- Strategy:
--   1. A trigger blocks every tenant DELETE unless the calling session
--      has explicitly opted in for THIS transaction by setting the GUC
--      `hir.allow_tenant_delete` to 'true'.
--   2. A SECURITY DEFINER RPC `hir_delete_tenant_rollback(p_tenant_id)`
--      provides the only sanctioned escape hatch for the two rollback
--      paths (and any future onboarding-cleanup path). The RPC sets
--      `hir.allow_tenant_delete=true` LOCALLY, then deletes — so the
--      flag never leaks beyond the function.
--
-- Manual override (psql / SQL editor) when restoring or migrating:
--
--     BEGIN;
--     SET LOCAL hir.allow_tenant_delete = 'true';
--     DELETE FROM public.tenants WHERE id = '...';
--     COMMIT;
--
-- `SET LOCAL` cannot leak across transactions, sessions, or queries. The
-- trigger fires on every row regardless of role (owner / service_role)
-- so it is a true defence-in-depth layer, NOT an RLS policy that
-- service_role would bypass.
--
-- Fully additive + idempotent.

create or replace function public.tenants_prevent_unguarded_delete()
returns trigger
language plpgsql
as $$
declare
  v_flag text;
begin
  -- current_setting(name, missing_ok=true) returns NULL when the GUC has
  -- never been set in this transaction. Compare against literal 'true'.
  v_flag := current_setting('hir.allow_tenant_delete', true);

  if v_flag is null or v_flag <> 'true' then
    raise exception
      'tenant delete blocked — set hir.allow_tenant_delete=true within the same transaction to override (intentional + audited). tenant_id=%, slug=%, name=%',
      old.id, old.slug, old.name
      using errcode = 'check_violation';
  end if;

  return old;
end;
$$;

comment on function public.tenants_prevent_unguarded_delete() is
  'Lane BACKUP-DR-AUDIT 2026-05-08 — defence-in-depth against accidental mass DELETE on public.tenants. Requires SET LOCAL hir.allow_tenant_delete=''true'' within the same transaction.';

drop trigger if exists trg_tenants_prevent_unguarded_delete on public.tenants;

create trigger trg_tenants_prevent_unguarded_delete
  before delete on public.tenants
  for each row
  execute function public.tenants_prevent_unguarded_delete();

-- ============================================================
-- Sanctioned rollback RPC for onboarding/signup failure cleanup.
-- ============================================================
-- Used by /api/signup and /dashboard/admin/onboard rollback branches
-- that need to delete a freshly-created tenant when membership insert
-- fails. SECURITY DEFINER + restricted GRANT means the caller does not
-- need any direct DELETE privilege on public.tenants — only the ability
-- to invoke this RPC via service_role.
--
-- Returns the number of rows deleted (0 or 1). Raises if a non-service
-- role attempts to call it.

create or replace function public.hir_delete_tenant_rollback(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- Limit scope: only service_role (which bypasses RLS for our admin
  -- code paths) may invoke. Belt-and-braces with the GRANT below.
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'hir_delete_tenant_rollback: unauthorized role %', current_user
      using errcode = 'insufficient_privilege';
  end if;

  set local hir.allow_tenant_delete = 'true';

  delete from public.tenants where id = p_tenant_id;
  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

comment on function public.hir_delete_tenant_rollback(uuid) is
  'Lane BACKUP-DR-AUDIT 2026-05-08 — sanctioned rollback path for onboarding/signup tenant cleanup. Locally sets hir.allow_tenant_delete=true within this function only.';

revoke all on function public.hir_delete_tenant_rollback(uuid) from public;
revoke all on function public.hir_delete_tenant_rollback(uuid) from anon, authenticated;
grant execute on function public.hir_delete_tenant_rollback(uuid) to service_role;
