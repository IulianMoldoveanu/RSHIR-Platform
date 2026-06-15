-- Idempotent fiscal protection flag
DO $$
DECLARE
  tbl text;
  protected_tables text[] := ARRAY[
    'restaurant_orders', 'payout_items', 'payout_periods',
    'connect_tenant_invoices', 'smartbill_invoice_jobs',
    'partner_commissions', 'partner_payouts',
    'fleet_courier_tariffs', 'psp_payments'
  ];
BEGIN
  FOREACH tbl IN ARRAY protected_tables LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE IF EXISTS %I ADD COLUMN IF NOT EXISTS is_financial_record BOOLEAN NOT NULL DEFAULT TRUE',
        tbl
      );
      EXECUTE format(
        'COMMENT ON COLUMN %I.is_financial_record IS %L',
        tbl,
        'Cod fiscal RO 10y retention. Purge crons MUST exclude WHERE is_financial_record = TRUE.'
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Table % does not exist — skipping', tbl;
    END;
  END LOOP;
END;
$$;

-- restaurant_orders: only fiscal states should be protected
UPDATE restaurant_orders
  SET is_financial_record = FALSE
WHERE status NOT IN ('PAID','DELIVERED','REFUNDED','PARTIALLY_REFUNDED')
  AND is_financial_record = TRUE;

-- Audit helper: list purge fns and whether they respect the flag
CREATE OR REPLACE FUNCTION public.fn_audit_financial_purge_protection()
RETURNS TABLE(function_name text, has_financial_filter boolean)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT p.proname::text, pg_get_functiondef(p.oid) ILIKE '%is_financial_record%'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname ILIKE 'fn_purge%';
$$;

COMMENT ON FUNCTION public.fn_audit_financial_purge_protection() IS
  'Advisory: scan purge fns for is_financial_record filter. Run after adding new purge crons.';
