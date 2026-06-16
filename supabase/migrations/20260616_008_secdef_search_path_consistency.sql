-- 20260616_008_secdef_search_path_consistency.sql
-- Fix HIGH finding from HIR-RSHIR-CURIER-BUCHAREST-AUDIT.md (Batch D — S9).
-- Aligns public.current_courier_fleet_id() with the 20260615_005 SECDEF
-- hardening standard (search_path = pg_catalog, public, extensions).
--
-- Background:
--   20260628_005_courier_profiles_rls_no_recursion.sql:37 created
--   current_courier_fleet_id() with `SET search_path TO 'public'`, which
--   diverges from the rest of the SECURITY DEFINER surface hardened in
--   20260615_005. A SECDEF function whose search_path omits pg_catalog can
--   be coerced into resolving built-in operator/cast names to user-supplied
--   schemas if an attacker can create a schema and shadow them — the
--   canonical mitigation is to pin pg_catalog first.
--
-- Idempotent: ALTER FUNCTION ... SET overrides any previous value, and the
-- function-existence guard makes re-runs safe even if the upstream function
-- is dropped/renamed later.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'current_courier_fleet_id'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.current_courier_fleet_id() '
         || 'SET search_path = pg_catalog, public, extensions';
    RAISE NOTICE 'Updated search_path on current_courier_fleet_id()';
  ELSE
    RAISE NOTICE 'Skipped: public.current_courier_fleet_id() not present';
  END IF;
END;
$$;

-- Audit helper: lists every SECURITY DEFINER function in `public` together
-- with its effective search_path (or flags it as INHERITED — RISK when the
-- function relies on the session default).
--
-- pg_proc.proconfig is a text[] of 'key=value' GUC overrides; we filter to
-- the search_path entry and strip the prefix. NULL means no per-function
-- override, which is the risk case the advisor flags.
CREATE OR REPLACE FUNCTION public.fn_audit_secdef_search_path()
RETURNS TABLE(function_name text, search_path_config text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
  SELECT
    p.proname::text AS function_name,
    COALESCE(
      (
        SELECT substring(cfg FROM 'search_path=(.*)')
        FROM unnest(p.proconfig) AS cfg
        WHERE cfg LIKE 'search_path=%'
        LIMIT 1
      ),
      'INHERITED -- RISK'
    ) AS search_path_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
  ORDER BY p.proname;
$$;

COMMENT ON FUNCTION public.fn_audit_secdef_search_path() IS
  'Lists SECURITY DEFINER functions in public schema and their pinned search_path. Rows reporting "INHERITED -- RISK" need an explicit ALTER FUNCTION ... SET search_path = pg_catalog, public, extensions.';

REVOKE ALL ON FUNCTION public.fn_audit_secdef_search_path() FROM public;
GRANT EXECUTE ON FUNCTION public.fn_audit_secdef_search_path() TO service_role;
