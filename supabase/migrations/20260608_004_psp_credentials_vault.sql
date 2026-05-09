-- HIR Restaurant Suite — PSP credentials Vault migration
--
-- Closes P1-1 from the 2026-05-09 security audit: Netopia api_key was being
-- written to `psp_credentials.api_key_encrypted` as plaintext (column name
-- was a placeholder). Switch to Supabase Vault, mirroring the SmartBill
-- precedent (20260506_010_smartbill_integration.sql).
--
-- Row count audit (Management API, 2026-05-09 evening): 0 rows in
-- psp_credentials. No data backfill needed; migration is purely additive
-- + drop of the unused column.
--
-- Idempotent. Safe to re-apply.

-- 1. Add api_key_vault_name column. We store a stable per-tenant name
--    (e.g. "psp_netopia_api_key__<tenant_uuid>") rather than a vault.secrets
--    UUID FK so the lookup path is name-keyed (same pattern as SmartBill
--    "smartbill_api_token__<tenant_uuid>"). NULL = no key configured yet.
alter table public.psp_credentials
  add column if not exists api_key_vault_name text;

comment on column public.psp_credentials.api_key_vault_name is
  'Vault secret name for the Netopia API key. Read via public.hir_read_vault_secret(name) (service-role only). Written via public.hir_write_vault_secret(name, value).';

-- 2. Drop the old plaintext column. Confirmed empty by Management API
--    query on 2026-05-09 evening (0 rows pre-migration), so no data loss
--    is possible. We DROP rather than null-out so future readers can't
--    accidentally write plaintext again.
alter table public.psp_credentials
  drop column if exists api_key_encrypted;

-- 3. Helpful index for the rare "tenants with a configured key" report
create index if not exists psp_credentials_vault_name_idx
  on public.psp_credentials(api_key_vault_name)
  where api_key_vault_name is not null;
