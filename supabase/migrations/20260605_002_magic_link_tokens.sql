-- Lane L PR 2 — magic-link mini-account.
-- Stores per-tenant single-use, hashed magic-link tokens that upgrade an
-- anonymous storefront customer cookie into a recognized "save my info"
-- session — no password, no signup form, no auth UI.
--
-- Security notes (matters):
--   * token_hash is SHA-256 of the raw token; the raw token only exists in
--     the email body. A DB leak doesn't compromise live sessions.
--   * tokens are scoped to (tenant_id, customer_id). A token issued for
--     tenant A can never authenticate against tenant B's storefront.
--   * single-use: used_at marks first redemption; subsequent attempts hit
--     the partial-uniqueness guard and fail.
--   * 24h TTL — hard-enforced by /api/account/magic-link/redeem reading
--     expires_at, AND by the partial unique index on (token_hash) where
--     used_at IS NULL (prevents replay even if a token leaks pre-redemption
--     and the row is somehow inserted twice).
--
-- Service-role only — no public RLS policies. Issue + redeem happen on
-- server routes that use the admin Supabase client.

create table if not exists public.magic_link_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  ip text,
  created_at timestamptz not null default now()
);

-- Look up by hash on redeem.
create index if not exists idx_magic_link_tokens_token_hash
  on public.magic_link_tokens (token_hash);

-- Per-customer rate-limiting query: count tokens in the last 24h.
create index if not exists idx_magic_link_tokens_customer_recent
  on public.magic_link_tokens (customer_id, created_at desc);

-- Tenant scope for fast cleanup.
create index if not exists idx_magic_link_tokens_tenant_expires
  on public.magic_link_tokens (tenant_id, expires_at);

alter table public.magic_link_tokens enable row level security;
-- no policies = service-role only access
