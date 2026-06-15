-- ============================================================================
-- Lock down anon EXECUTE on SECURITY DEFINER functions
-- 19-agent + 4-lens adversarial review (workflow w2a3k5ngv) flagged 40
-- SECURITY DEFINER functions executable by anon. Classify each:
--
--   A) LEGITIMATELY anon-callable (customer storefront flow): KEEP anon grant.
--   B) TRIGGER FUNCTIONS (executed by AFTER INSERT under definer privs;
--      privilege of the calling role doesn't matter): REVOKE FROM anon for hygiene.
--   C) INTERNAL HELPERS / CRON / RLS HELPERS: REVOKE EXECUTE FROM PUBLIC + anon.
--
-- All functions also get `SET search_path = pg_catalog, public, extensions`
-- to address function_search_path_mutable WARN findings AND avoid breaking
-- functions that use pgcrypto (digest) or pgvector (vector type) from the
-- `extensions` schema. Refute caught this — naive `pg_catalog, public` would
-- have broken audit_log_compute_hash + search_code_chunks + audit_log_verify_chain.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A) LEGITIMATELY anon-callable — keep anon EXECUTE. Just lock search_path.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.get_courier_track(p_track_token text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.get_courier_track_messages(p_track_token text, p_limit integer) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.get_linked_courier_track_token(p_restaurant_token uuid) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.get_public_order(p_token uuid) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.post_courier_track_message(p_track_token text, p_body text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.submit_delivery_rating(p_track_token text, p_stars integer, p_tags text[], p_comment text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.submit_order_review(p_token uuid, p_rating smallint, p_comment text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.verify_display_pin(p_tenant_slug text, p_pin text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.set_display_pin(p_tenant_id uuid, p_new_pin text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.fn_reservation_request(p_tenant_id uuid, p_first_name text, p_phone text, p_email text, p_party_size integer, p_requested_at timestamp with time zone, p_notes text, p_table_id text) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.fn_reserved_table_ids(p_tenant_id uuid, p_requested_at timestamp with time zone) SET search_path = pg_catalog, public, extensions;
ALTER FUNCTION public.is_tenant_zone_paused(p_tenant_id uuid, p_zone_id uuid) SET search_path = pg_catalog, public, extensions;

-- ----------------------------------------------------------------------------
-- B) TRIGGER FUNCTIONS — anon EXECUTE doesn't affect trigger firing.
--    Revoke for hygiene; set search_path.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.capture_courier_order_event() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.capture_courier_order_event() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.connect_enqueue_order_webhook() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.connect_enqueue_order_webhook() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.dispatch_courier_push_on_new_order() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.dispatch_courier_push_on_new_order() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.dispatch_courier_push_on_offer() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.dispatch_courier_push_on_offer() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_customer_status_changed() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.notify_customer_status_changed() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_feedback_for_triage() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.notify_feedback_for_triage() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_feedback_inserted() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.notify_feedback_inserted() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_github_event_for_triage() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.notify_github_event_for_triage() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_new_order_paid() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.notify_new_order_paid() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.notify_track_broadcast() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.notify_track_broadcast() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.smartbill_enqueue_on_delivered() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.smartbill_enqueue_on_delivered() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.sync_courier_to_restaurant_status() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.sync_courier_to_restaurant_status() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.sync_restaurant_to_courier_order() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.sync_restaurant_to_courier_order() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- C) INTERNAL HELPERS / CRON / RLS HELPERS — revoke from PUBLIC + anon.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.approve_slot_change(p_change_slot_id uuid) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.approve_slot_change(p_change_slot_id uuid) FROM PUBLIC, anon;

ALTER FUNCTION public.check_and_increment_usage(p_tenant_id uuid, p_resource_kind text, p_amount integer, p_cap_override integer) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_usage(p_tenant_id uuid, p_resource_kind text, p_amount integer, p_cap_override integer) FROM PUBLIC, anon;

ALTER FUNCTION public.cleanup_integration_events() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.cleanup_integration_events() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.current_courier_fleet_id() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.current_courier_fleet_id() FROM PUBLIC, anon;

ALTER FUNCTION public.fn_dispatch_fix_attempt() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.fn_dispatch_fix_attempt() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.fn_dispatch_supervise_fix() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.fn_dispatch_supervise_fix() FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.fn_loyalty_earn(p_tenant_id uuid, p_customer_id uuid, p_order_id uuid, p_points integer, p_note text) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.fn_loyalty_earn(p_tenant_id uuid, p_customer_id uuid, p_order_id uuid, p_points integer, p_note text) FROM PUBLIC, anon;

ALTER FUNCTION public.fn_loyalty_redeem(p_tenant_id uuid, p_customer_id uuid, p_order_id uuid, p_points integer, p_note text) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.fn_loyalty_redeem(p_tenant_id uuid, p_customer_id uuid, p_order_id uuid, p_points integer, p_note text) FROM PUBLIC, anon;

ALTER FUNCTION public.is_tenant_member(t_id uuid) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(t_id uuid) FROM PUBLIC, anon;

ALTER FUNCTION public.is_tenant_owner(t_id uuid) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.is_tenant_owner(t_id uuid) FROM PUBLIC, anon;

ALTER FUNCTION public.refresh_mv_logged(p_schema text, p_name text, p_concurrent boolean) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.refresh_mv_logged(p_schema text, p_name text, p_concurrent boolean) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.reject_slot_change(p_change_slot_id uuid, p_reason text) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.reject_slot_change(p_change_slot_id uuid, p_reason text) FROM PUBLIC, anon;

ALTER FUNCTION public.request_slot_change(p_slot_id uuid, p_new_start timestamp with time zone, p_new_end timestamp with time zone, p_reason text) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.request_slot_change(p_slot_id uuid, p_new_start timestamp with time zone, p_new_end timestamp with time zone, p_reason text) FROM PUBLIC, anon;

ALTER FUNCTION public.reseller_leads_expire_stale() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.reseller_leads_expire_stale() FROM PUBLIC, anon, authenticated;

-- search_code_chunks uses extensions.vector — search_path includes extensions.
ALTER FUNCTION public.search_code_chunks(p_query_embedding extensions.vector, p_query_text text, p_app_filter text, p_limit integer) SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.search_code_chunks(p_query_embedding extensions.vector, p_query_text text, p_app_filter text, p_limit integer) FROM PUBLIC, anon, authenticated;

-- fn_purge_30day_retention already revoked from anon/authenticated in migration
-- 20260615_002; but PUBLIC retained EXECUTE by default — kill that here too.
ALTER FUNCTION public.fn_purge_30day_retention() SET search_path = pg_catalog, public, extensions;
REVOKE EXECUTE ON FUNCTION public.fn_purge_30day_retention() FROM PUBLIC;

COMMIT;
