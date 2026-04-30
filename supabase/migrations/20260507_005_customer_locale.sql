-- HIR Restaurant Suite — RSHIR-i18n customer locale.
-- Stores the customer's preferred storefront language so the
-- notify-customer-status Edge Function can pick RO vs EN copy
-- without re-deriving locale from cookies/headers.
-- Defaults to 'ro' so existing rows stay correct (current installs are RO).

alter table public.customers
  add column if not exists locale text not null default 'ro'
    check (locale in ('ro', 'en'));
