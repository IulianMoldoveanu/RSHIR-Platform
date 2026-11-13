-- RLS policies were re-evaluating auth.uid() once per row.
--
-- Postgres can hoist a subquery that does not depend on the row into an
-- InitPlan and run it once for the whole statement. A bare `auth.uid()` in a
-- policy is not a subquery, so it ran per row: on a table scan of N rows the
-- function was called N times. Wrapping it as `(select auth.uid())` is the
-- documented Supabase fix and changes nothing about what the policy decides —
-- the value is identical, it is just computed once.
--
-- This matters now because the platform is about to carry real Bucharest
-- volume, and this is the cost that grows with the number of rows rather than
-- with the number of requests.
--
-- 124 policies across ~50 tables, including the courier hot path
-- (courier_orders, courier_profiles, courier_shifts, order_messages).
-- Supabase advisor count: 125 -> 0.
--
-- These statements were GENERATED FROM THE LIVE POLICY DEFINITIONS read out of
-- pg_policies, not retyped from migration files, and applied with ALTER POLICY
-- so that the policy name, table, command, permissive flag and role list are
-- untouched. Verified by snapshotting all 262 policies before and after:
-- none added, none removed, zero metadata changes, and every one of the 137
-- changed expressions differs ONLY by the wrapping.
--
-- The last two use current_setting() rather than auth.*(), and are at the end.

set local search_path = public;

alter policy "aggregator_email_jobs_select_own" on public."aggregator_email_jobs" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = aggregator_email_jobs.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "aggregator_intake_aliases_select_own" on public."aggregator_intake_aliases" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = aggregator_intake_aliases.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "audit_log_tenant_member_read" on public."audit_log" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = audit_log.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "connect_invoices_tenant_read" on public."connect_tenant_invoices" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = connect_tenant_invoices.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "members read own deliveries" on public."connect_webhook_deliveries" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = connect_webhook_deliveries.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "members read own endpoints" on public."connect_webhook_endpoints" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = connect_webhook_endpoints.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "content_agent_prompts_authenticated_select" on public."content_agent_prompts" using ((brand_code IN ( SELECT bc.brand_code
   FROM content_brand_contexts bc
  WHERE (bc.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = (select auth.uid())))))));
alter policy "content_brand_contexts_member_select" on public."content_brand_contexts" using ((((tenant_id IS NULL) AND false) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = (select auth.uid()))))));
alter policy "content_briefs_member_select" on public."content_briefs" using ((brand_id IN ( SELECT content_brand_contexts.id
   FROM content_brand_contexts
  WHERE (content_brand_contexts.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = (select auth.uid())))))));
alter policy "content_drafts_member_select" on public."content_drafts" using ((brief_id IN ( SELECT b.id
   FROM (content_briefs b
     JOIN content_brand_contexts bc ON ((bc.id = b.brand_id)))
  WHERE (bc.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = (select auth.uid())))))));
alter policy "content_drafts_member_status_update" on public."content_drafts" using (((status = 'draft'::text) AND (brief_id IN ( SELECT b.id
   FROM (content_briefs b
     JOIN content_brand_contexts bc ON ((bc.id = b.brand_id)))
  WHERE (bc.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = (select auth.uid())))))))) with check ((status = ANY (ARRAY['approved'::text, 'rejected'::text])));
alter policy "content_metrics_member_select" on public."content_metrics" using ((publication_id IN ( SELECT p.id
   FROM (((content_publications p
     JOIN content_drafts d ON ((d.id = p.draft_id)))
     JOIN content_briefs b ON ((b.id = d.brief_id)))
     JOIN content_brand_contexts bc ON ((bc.id = b.brand_id)))
  WHERE (bc.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = (select auth.uid())))))));
alter policy "content_publications_member_select" on public."content_publications" using ((draft_id IN ( SELECT d.id
   FROM ((content_drafts d
     JOIN content_briefs b ON ((b.id = d.brief_id)))
     JOIN content_brand_contexts bc ON ((bc.id = b.brand_id)))
  WHERE (bc.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = (select auth.uid())))))));
alter policy "copilot_brief_schedules_member_read" on public."copilot_brief_schedules" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = copilot_brief_schedules.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "courier_account_deletion_requests_own_read" on public."courier_account_deletion_requests" using ((courier_user_id = (select auth.uid())));
alter policy "courier_deletion_requests_admin_read" on public."courier_account_deletion_requests" using ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = (select auth.uid())))));
alter policy "courier_deletion_requests_fleet_read" on public."courier_account_deletion_requests" using ((EXISTS ( SELECT 1
   FROM courier_fleets f
  WHERE ((f.id = courier_account_deletion_requests.fleet_id) AND (f.owner_user_id = (select auth.uid()))))));
alter policy "courier_agent_runs_self_select" on public."courier_agent_runs" using ((courier_id = (select auth.uid())));
alter policy "courier_api_keys_owner_insert" on public."courier_api_keys" with check ((owner_user_id = (select auth.uid())));
alter policy "courier_api_keys_owner_read" on public."courier_api_keys" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "courier_api_keys_owner_select" on public."courier_api_keys" using ((owner_user_id = (select auth.uid())));
alter policy "courier_api_keys_owner_update" on public."courier_api_keys" using ((owner_user_id = (select auth.uid()))) with check ((owner_user_id = (select auth.uid())));
alter policy "ccp_self_select" on public."courier_combo_pushes" using ((courier_user_id = (select auth.uid())));
alter policy "courier_daily_kpis_own_read" on public."courier_daily_kpis" using ((courier_user_id = (select auth.uid())));
alter policy "courier_feedback_admin_read" on public."courier_feedback" using ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = (select auth.uid())))));
alter policy "courier_feedback_fleet_read" on public."courier_feedback" using ((EXISTS ( SELECT 1
   FROM courier_fleets f
  WHERE ((f.id = courier_feedback.fleet_id) AND (f.owner_user_id = (select auth.uid()))))));
alter policy "courier_feedback_own_insert" on public."courier_feedback" with check ((courier_user_id = (select auth.uid())));
alter policy "courier_feedback_own_read" on public."courier_feedback" using ((courier_user_id = (select auth.uid())));
alter policy "courier_fleets_member_read" on public."courier_fleets" using ((id IN ( SELECT cp.fleet_id
   FROM courier_profiles cp
  WHERE (cp.user_id = (select auth.uid())))));
alter policy "courier_fleets_owner_read" on public."courier_fleets" using ((owner_user_id = (select auth.uid())));
alter policy "courier_inserts_own_application" on public."courier_job_applications" with check (((courier_user_id = (select auth.uid())) AND (status = 'PENDING'::text) AND (EXISTS ( SELECT 1
   FROM courier_job_listings jl
  WHERE ((jl.id = courier_job_applications.job_listing_id) AND (jl.status = 'OPEN'::text))))));
alter policy "courier_reads_own_applications" on public."courier_job_applications" using ((courier_user_id = (select auth.uid())));
alter policy "courier_withdraws_own_application" on public."courier_job_applications" using (((courier_user_id = (select auth.uid())) AND (status = ANY (ARRAY['PENDING'::text, 'REVIEWING'::text, 'INTERVIEWED'::text])))) with check (((courier_user_id = (select auth.uid())) AND (status = 'WITHDRAWN'::text)));
alter policy "courier_kyc_read" on public."courier_kyc" using ((courier_user_id = (select auth.uid())));
alter policy "courier_orders_assignee_or_open_select" on public."courier_orders" using (((assigned_courier_user_id = (select auth.uid())) OR ((assigned_courier_user_id IS NULL) AND (status = ANY (ARRAY['CREATED'::text, 'OFFERED'::text])) AND (fleet_id IN ( SELECT courier_profiles.fleet_id
   FROM courier_profiles
  WHERE (courier_profiles.user_id = (select auth.uid())))))));
alter policy "courier_reads_own_permit_audit" on public."courier_permit_audit_log" using ((courier_user_id = (select auth.uid())));
alter policy "courier_profiles_self_read" on public."courier_profiles" using (((user_id = (select auth.uid())) OR (fleet_id = current_courier_fleet_id())));
alter policy "courier_profiles_self_select" on public."courier_profiles" using ((user_id = (select auth.uid())));
alter policy "courier_profiles_self_update" on public."courier_profiles" using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "courier_push_own" on public."courier_push_subscriptions" using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "courier_push_tokens_own_read" on public."courier_push_tokens" using ((courier_user_id = (select auth.uid())));
alter policy "courier_push_tokens_own_update" on public."courier_push_tokens" using ((courier_user_id = (select auth.uid())));
alter policy "courier_push_tokens_own_upsert" on public."courier_push_tokens" with check ((courier_user_id = (select auth.uid())));
alter policy "css_admin_select" on public."courier_shift_slots" using ((EXISTS ( SELECT 1
   FROM platform_admins
  WHERE (platform_admins.user_id = (select auth.uid())))));
alter policy "css_courier_insert" on public."courier_shift_slots" with check (((courier_user_id = (select auth.uid())) AND (status = ANY (ARRAY['REQUESTED'::text, 'REQUESTED_CHANGE'::text]))));
alter policy "css_courier_select" on public."courier_shift_slots" using ((courier_user_id = (select auth.uid())));
alter policy "css_courier_update" on public."courier_shift_slots" using ((courier_user_id = (select auth.uid()))) with check (((courier_user_id = (select auth.uid())) AND (status = 'CANCELLED'::text)));
alter policy "courier_shifts_self_insert" on public."courier_shifts" with check ((courier_user_id = (select auth.uid())));
alter policy "courier_shifts_self_select" on public."courier_shifts" using ((courier_user_id = (select auth.uid())));
alter policy "courier_shifts_self_update" on public."courier_shifts" using ((courier_user_id = (select auth.uid()))) with check ((courier_user_id = (select auth.uid())));
alter policy "courier_tips_owner_delete" on public."courier_tips" using ((courier_user_id = (select auth.uid())));
alter policy "courier_tips_owner_insert" on public."courier_tips" with check (((courier_user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM courier_orders co
  WHERE ((co.id = courier_tips.delivery_id) AND (co.assigned_courier_user_id = (select auth.uid())))))));
alter policy "courier_tips_owner_select" on public."courier_tips" using ((courier_user_id = (select auth.uid())));
alter policy "courier_tips_owner_update" on public."courier_tips" using ((courier_user_id = (select auth.uid()))) with check (((courier_user_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM courier_orders co
  WHERE ((co.id = courier_tips.delivery_id) AND (co.assigned_courier_user_id = (select auth.uid())))))));
alter policy "courier_transfers_own_read" on public."courier_transfers" using ((courier_user_id = (select auth.uid())));
alter policy "cs_agent_responses_member_read" on public."cs_agent_responses" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = cs_agent_responses.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "tenant members can insert reactivation contacts" on public."customer_reactivation_contacts" with check ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = customer_reactivation_contacts.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "tenant members can select reactivation contacts" on public."customer_reactivation_contacts" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = customer_reactivation_contacts.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "delivery_complaints_courier_read" on public."delivery_complaints" using (((courier_user_id = (select auth.uid())) OR is_tenant_member(source_tenant_id)));
alter policy "delivery_dispatch_failures_member_read" on public."delivery_dispatch_failures" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = delivery_dispatch_failures.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "delivery_pricings_tenant_or_courier_select" on public."delivery_pricings" using (((delivery_id IN ( SELECT courier_orders.id
   FROM courier_orders
  WHERE (courier_orders.source_tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = (select auth.uid())))))) OR (delivery_id IN ( SELECT courier_orders.id
   FROM courier_orders
  WHERE (courier_orders.assigned_courier_user_id = (select auth.uid()))))));
alter policy "delivery_ratings_courier_read" on public."delivery_ratings" using (((courier_user_id = (select auth.uid())) OR is_tenant_member(source_tenant_id)));
alter policy "tenant members can read forecast" on public."demand_forecast_cells" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = demand_forecast_cells.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "courier_reads_own_driver_score" on public."driver_scores" using ((courier_user_id = (select auth.uid())));
alter policy "feedback_reports_tenant_member_insert" on public."feedback_reports" with check (((reporter_user_id = (select auth.uid())) AND (tenant_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = feedback_reports.tenant_id) AND (tm.user_id = (select auth.uid())))))));
alter policy "feedback_reports_tenant_member_select" on public."feedback_reports" using (((tenant_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = feedback_reports.tenant_id) AND (tm.user_id = (select auth.uid())))))));
alter policy "fleet_billing_tariffs_owner_read" on public."fleet_billing_tariffs" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "fleet_courier_tariffs_owner_select" on public."fleet_courier_tariffs" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "fde_tenant_owner_self" on public."fleet_demand_estimates" using (((source = 'self_estimate'::text) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = (select auth.uid())) AND (tenant_members.role = 'OWNER'::text)))))) with check (((source = 'self_estimate'::text) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = (select auth.uid())) AND (tenant_members.role = 'OWNER'::text))))));
alter policy "fleet_invoice_items_owner_read" on public."fleet_invoice_items" using ((invoice_period_id IN ( SELECT fp.id
   FROM fleet_invoice_periods fp
  WHERE (fp.fleet_id IN ( SELECT courier_fleets.id
           FROM courier_fleets
          WHERE (courier_fleets.owner_user_id = (select auth.uid())))))));
alter policy "fleet_invoice_periods_owner_read" on public."fleet_invoice_periods" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "fleet_kyf_owner_read" on public."fleet_kyf" using ((EXISTS ( SELECT 1
   FROM courier_fleets cf
  WHERE ((cf.id = fleet_kyf.fleet_id) AND (cf.owner_user_id = (select auth.uid()))))));
alter policy "fra_fleet_owner_read" on public."fleet_restaurant_assignments" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "fleet_strikes_fleet_owner_read" on public."fleet_strikes" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "fleet_vendor_tariffs_owner_read" on public."fleet_vendor_tariffs" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "fleet_zones_owner_read" on public."fleet_zones" using ((fleet_id IN ( SELECT courier_fleets.id
   FROM courier_fleets
  WHERE (courier_fleets.owner_user_id = (select auth.uid())))));
alter policy "fm_invites_owner_read" on public."fm_invites" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = fm_invites.tenant_id) AND (tm.user_id = (select auth.uid())) AND (tm.role = 'OWNER'::text)))));
alter policy "growth_recs_platform_admin_read" on public."growth_recommendations" using ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = (select auth.uid())))));
alter policy "growth_recs_tenant_member_decide" on public."growth_recommendations" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = growth_recommendations.tenant_id) AND (tm.user_id = (select auth.uid())))))) with check ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = growth_recommendations.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "growth_recs_tenant_member_read" on public."growth_recommendations" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = growth_recommendations.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "hepy_connect_nonces_owner_read" on public."hepy_connect_nonces" using ((owner_user_id = (select auth.uid())));
alter policy "hepy_conversation_state_owner_read" on public."hepy_conversation_state" using ((EXISTS ( SELECT 1
   FROM hepy_owner_bindings b
  WHERE ((b.tenant_id = hepy_conversation_state.tenant_id) AND (b.telegram_user_id = hepy_conversation_state.telegram_user_id) AND (b.owner_user_id = (select auth.uid())) AND (b.unbound_at IS NULL)))));
alter policy "hepy_owner_bindings_owner_read" on public."hepy_owner_bindings" using ((owner_user_id = (select auth.uid())));
alter policy "integration_events_member_read" on public."integration_events" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = integration_events.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "integration_providers_member_read" on public."integration_providers" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = integration_providers.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "inventory_items_member_read" on public."inventory_items" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = inventory_items.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "inventory_movements_member_read" on public."inventory_movements" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = inventory_movements.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "loyalty_accounts_member_read" on public."loyalty_accounts" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = loyalty_accounts.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "loyalty_ledger_member_read" on public."loyalty_ledger" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = loyalty_ledger.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "loyalty_settings_member_read" on public."loyalty_settings" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = loyalty_settings.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "marketing_drafts_member_read" on public."marketing_drafts" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = marketing_drafts.restaurant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "medical_access_logs_service_role_all" on public."medical_access_logs" using (((select auth.role()) = 'service_role'::text)) with check (((select auth.role()) = 'service_role'::text));
alter policy "menu_agent_invocations_owner_read" on public."menu_agent_invocations" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = menu_agent_invocations.tenant_id) AND (tm.user_id = (select auth.uid())) AND (tm.role = 'OWNER'::text)))));
alter policy "menu_agent_proposals_member_read" on public."menu_agent_proposals" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = menu_agent_proposals.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "menu_item_recipes_member_read" on public."menu_item_recipes" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = menu_item_recipes.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "mv_refresh_log_platform_admin_read" on public."mv_refresh_log" using ((EXISTS ( SELECT 1
   FROM platform_admins pa
  WHERE (pa.user_id = (select auth.uid())))));
alter policy "newsletter_subscribers_member_read" on public."newsletter_subscribers" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = newsletter_subscribers.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "ops_alerts_admin_select" on public."ops_alerts" using ((((select auth.jwt()) ->> 'email'::text) IN ( SELECT unnest(string_to_array(COALESCE(current_setting('app.platform_admin_emails'::text, true), ''::text), ','::text)) AS unnest)));
alter policy "order_messages_insert_tenant_or_courier" on public."order_messages" with check (((from_user_id = (select auth.uid())) AND (from_role = ANY (ARRAY['TENANT'::text, 'COURIER'::text])) AND ((EXISTS ( SELECT 1
   FROM courier_orders co
  WHERE ((co.id = order_messages.courier_order_id) AND (co.source_tenant_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM tenant_members tm
          WHERE ((tm.tenant_id = co.source_tenant_id) AND (tm.user_id = (select auth.uid()))))) AND (order_messages.from_role = 'TENANT'::text) AND (order_messages.channel = ANY (ARRAY['TENANT_COURIER'::text, 'BROADCAST'::text]))))) OR (EXISTS ( SELECT 1
   FROM courier_orders co
  WHERE ((co.id = order_messages.courier_order_id) AND (co.assigned_courier_user_id = (select auth.uid())) AND (order_messages.from_role = 'COURIER'::text) AND (order_messages.channel = ANY (ARRAY['TENANT_COURIER'::text, 'CLIENT_COURIER'::text, 'BROADCAST'::text]))))))));
alter policy "order_messages_select_tenant_or_courier" on public."order_messages" using ((((tenant_id IS NOT NULL) AND (channel = ANY (ARRAY['TENANT_COURIER'::text, 'BROADCAST'::text])) AND (EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = order_messages.tenant_id) AND (tm.user_id = (select auth.uid())))))) OR (EXISTS ( SELECT 1
   FROM courier_orders co
  WHERE ((co.id = order_messages.courier_order_id) AND (co.assigned_courier_user_id = (select auth.uid())))))));
alter policy "order_messages_update_courier_read" on public."order_messages" using (((from_role = 'CLIENT'::text) AND (channel = 'CLIENT_COURIER'::text) AND (EXISTS ( SELECT 1
   FROM courier_orders co
  WHERE ((co.id = order_messages.courier_order_id) AND (co.assigned_courier_user_id = (select auth.uid()))))))) with check (((from_role = 'CLIENT'::text) AND (channel = 'CLIENT_COURIER'::text) AND (EXISTS ( SELECT 1
   FROM courier_orders co
  WHERE ((co.id = order_messages.courier_order_id) AND (co.assigned_courier_user_id = (select auth.uid())))))));
alter policy "payout_items_courier_select" on public."payout_items" using ((payout_period_id IN ( SELECT payout_periods.id
   FROM payout_periods
  WHERE (payout_periods.courier_user_id = (select auth.uid())))));
alter policy "payout_periods_courier_select" on public."payout_periods" using ((courier_user_id = (select auth.uid())));
alter policy "pharma_courier_links_self_read" on public."pharma_courier_links" using ((supabase_user_id = (select auth.uid())));
alter policy "platform_admins_self_read" on public."platform_admins" using ((user_id = (select auth.uid())));
alter policy "purchase_orders_member_read" on public."purchase_orders" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = purchase_orders.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "reservation_settings_member_read" on public."reservation_settings" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = reservation_settings.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "reservations_member_read" on public."reservations" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = reservations.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "restaurant_reviews_tenant_member_read" on public."restaurant_reviews" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = restaurant_reviews.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "smartbill_jobs_tenant_read" on public."smartbill_invoice_jobs" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = smartbill_invoice_jobs.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "suppliers_member_read" on public."suppliers" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = suppliers.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "tenant_agent_trust_member_read" on public."tenant_agent_trust" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = tenant_agent_trust.restaurant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "tenant_api_keys_member_read" on public."tenant_api_keys" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = tenant_api_keys.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "members_self_select" on public."tenant_members" using (((user_id = (select auth.uid())) OR is_tenant_member(tenant_id)));
alter policy "tenant_onboarding_drafts_owner_read" on public."tenant_onboarding_drafts" using ((user_id = (select auth.uid())));
alter policy "tenant_onboarding_drafts_owner_write" on public."tenant_onboarding_drafts" using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "tenant_pricing_overrides_tenant_select" on public."tenant_pricing_overrides" using ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = (select auth.uid())))));
alter policy "tenant_zone_pauses_tenant_insert" on public."tenant_zone_pauses" with check (((paused_by = (select auth.uid())) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = (select auth.uid()))))));
alter policy "tenant_zone_pauses_tenant_resume" on public."tenant_zone_pauses" using ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = (select auth.uid()))))) with check ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = (select auth.uid())))));
alter policy "tenant_zone_pauses_tenant_select" on public."tenant_zone_pauses" using ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = (select auth.uid())))));
alter policy "voice_calls_member_read" on public."voice_calls" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = voice_calls.tenant_id) AND (tm.user_id = (select auth.uid()))))));
alter policy "whatsapp_connect_nonces_owner_read" on public."whatsapp_connect_nonces" using ((owner_user_id = (select auth.uid())));
alter policy "whatsapp_messages_tenant_member_read" on public."whatsapp_messages" using ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = whatsapp_messages.tenant_id) AND (tm.user_id = (select auth.uid())) AND (tm.role = 'OWNER'::text)))));
alter policy "whatsapp_owner_bindings_owner_read" on public."whatsapp_owner_bindings" using ((owner_user_id = (select auth.uid())));

-- current_setting() variants
alter policy "tenant owns request" on public.stripe_onboarding_requests
  using (tenant_id = (select current_setting('app.tenant_id', true)));
alter policy "ops_alerts_admin_select" on public.ops_alerts
  using (
    ((select auth.jwt()) ->> 'email') in (
      select unnest(string_to_array(
        (select coalesce(current_setting('app.platform_admin_emails', true), '')), ','))
    )
  );
