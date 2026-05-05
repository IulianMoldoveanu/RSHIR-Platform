-- Fleet Manager multi-tenant Option A.
--
-- Anchor use case (Brașov pilot): an external Fleet Manager runs his own
-- dispatch app. HIR forwards orders to him via signed webhook — the HIR
-- courier app is bypassed for tenants where this is configured. The same
-- FM is also a member of N restaurants from a single admin login (the
-- multi-tenant membership already works through tenant_members).
--
-- All changes are additive + idempotent. Defaults are NULL / false so
-- existing tenants keep dispatching through the HIR courier app
-- unchanged. Activation requires explicit opt-in per tenant from the
-- platform-admin UI (PR 2).
--
-- Internal naming uses "external_dispatch_*" rather than "fleet_*" to
-- keep the merchant-facing surface free of fleet/subcontractor terms
-- (per dispatch confidentiality rule — merchants only see "curier HIR").

-- 1. Per-tenant external dispatch config. NULL/false = use HIR's own
--    courier app (current behaviour). When the URL+secret are set and
--    the flag is true, the dispatch hook (PR 3) POSTs a signed payload
--    instead of populating the in-app courier feed.
alter table public.tenants
  add column if not exists external_dispatch_webhook_url text;

alter table public.tenants
  add column if not exists external_dispatch_secret text;

alter table public.tenants
  add column if not exists external_dispatch_enabled boolean not null default false;

-- Belt-and-suspenders: if anyone toggles the flag on without a URL the
-- dispatch hook should treat it as disabled, but we also enforce at the
-- DB level so a misconfigured row can never reach the webhook code.
alter table public.tenants
  drop constraint if exists tenants_external_dispatch_requires_url_chk;

alter table public.tenants
  add constraint tenants_external_dispatch_requires_url_chk
  check (
    external_dispatch_enabled = false
    or (
      external_dispatch_webhook_url is not null
      and external_dispatch_secret is not null
    )
  );

comment on column public.tenants.external_dispatch_webhook_url is
  'Internal-only. When set + external_dispatch_enabled, restaurant_orders status=DISPATCHED transitions POST to this URL instead of the in-app courier dispatch flow. Never displayed to merchants — see dispatch confidentiality rule.';

comment on column public.tenants.external_dispatch_secret is
  'Internal-only. HMAC-SHA256 shared secret for X-HIR-Signature on the dispatch webhook. Rotate from platform-admin UI.';

comment on column public.tenants.external_dispatch_enabled is
  'Internal-only. Master switch for external dispatch. False = use HIR courier app.';

-- 2. Audit table for external dispatch attempts. Lets the platform-admin
--    UI surface "FM webhook is failing" without scraping logs, and gives
--    us a per-tenant retry/success rate for the fleet partner SLA.
--
--    No RLS — service_role only writes/reads. Platform-admin UI uses the
--    admin client (service_role). Couriers / merchants never query this.
create table if not exists public.external_dispatch_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  attempt_number integer not null,
  request_url text not null,
  request_body_sha256 text not null,
  response_status integer,
  response_body_excerpt text,
  error_message text,
  succeeded boolean not null default false,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_dispatch_attempts_tenant_created
  on public.external_dispatch_attempts(tenant_id, created_at desc);

create index if not exists idx_external_dispatch_attempts_order
  on public.external_dispatch_attempts(order_id);

comment on table public.external_dispatch_attempts is
  'Audit log of webhook POSTs to external Fleet Manager dispatch endpoints. Internal-only. Service role write-only.';

-- 3. Note: tenant_members.role already permits FLEET_MANAGER from
--    migration 20260603_002_phase1_fleet_schema.sql (constraint
--    tenants_role_check covers OWNER/STAFF/FLEET_MANAGER). No change
--    needed here — leaving this comment as a lookup anchor for the
--    next person who searches for "FLEET_MANAGER role".
