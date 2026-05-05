-- Lane L PR 1 — newsletter discount at checkout.
-- Adds the columns the per-email WELCOME flow needs:
--   * promo_codes.customer_email — when set, the code is reserved for one
--     specific email (one-time WELCOME code issued at checkout opt-in).
--     NULL keeps the existing tenant-wide code semantics.
--   * promo_codes.usage_limit    — alias for max_uses; we keep both so the
--     existing `max_uses` keeps working (server reads max_uses) and new
--     callers can be explicit. Default NULL (unlimited).
--   * storefront_notify_signups.source — distinguishes 'menu_empty' (the
--     existing surface) from 'checkout' (this lane). NULL for legacy rows.
-- All additive, idempotent, post-merge auto-applicable per Strategy v2.

alter table public.promo_codes
  add column if not exists customer_email text,
  add column if not exists usage_limit integer;

create index if not exists promo_codes_tenant_customer_email
  on public.promo_codes (tenant_id, customer_email)
  where customer_email is not null;

alter table public.storefront_notify_signups
  add column if not exists source text;

create index if not exists idx_storefront_notify_signups_source
  on public.storefront_notify_signups (source);
