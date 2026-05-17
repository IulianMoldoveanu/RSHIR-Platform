-- Country + currency on tenants for future international expansion.
-- Default 'RO' + 'RON' so existing RO behaviour is unchanged.
-- ISO 3166-1 alpha-2 (country_code) + ISO 4217 (currency_code).
alter table public.tenants
  add column if not exists country_code char(2) not null default 'RO',
  add column if not exists currency_code char(3) not null default 'RON';

-- Basic format guards — values must already be uppercase when inserted.
alter table public.tenants
  add constraint tenants_country_code_uppercase check (country_code = upper(country_code)),
  add constraint tenants_currency_code_uppercase check (currency_code = upper(currency_code));

create index if not exists tenants_country_code_idx on public.tenants(country_code);
