-- HIR Connect: headless service-layer tier for restaurants with own site
create type if not exists public.tenant_delivery_mode as enum ('full_saas', 'headless');

alter table public.tenants
  add column if not exists delivery_mode public.tenant_delivery_mode
    not null default 'full_saas';

create index if not exists idx_tenants_delivery_mode
  on public.tenants(delivery_mode) where delivery_mode = 'headless';

-- Connect-specific settings sub-object (status_webhook_url + secret managed by Task 2)
-- Just reserve the JSON path here so type stays predictable.
comment on column public.tenants.delivery_mode is
  'full_saas (default) = traditional HIR SaaS (storefront + admin + courier + AI). '
  'headless = HIR Connect tier (restaurant keeps own site; HIR is service-layer only — '
  'API ingest, courier dispatch, AI agents over order stream). See settings.connect.* for '
  'headless-specific config (webhook URLs, signing secrets — populated by connect-webhook PR).';
