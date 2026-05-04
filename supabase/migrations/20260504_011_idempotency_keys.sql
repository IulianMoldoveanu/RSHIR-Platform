-- Idempotency-Key support for /api/checkout/intent.
-- A duplicate POST with the same Idempotency-Key + request body hash
-- returns the cached response instead of creating a new order.
-- TTL: 24h. Older rows are pruned by the cron job (separate task).

create table if not exists public.idempotency_keys (
  tenant_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  response jsonb not null,
  status_code int not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, idempotency_key, request_hash)
);

create index if not exists idx_idempotency_keys_created_at
  on public.idempotency_keys (created_at);

alter table public.idempotency_keys enable row level security;

drop policy if exists "service_role_only_idempotency_keys" on public.idempotency_keys;
create policy "service_role_only_idempotency_keys"
  on public.idempotency_keys for all
  to service_role using (true) with check (true);

comment on table public.idempotency_keys is
  'RSHIR-A3: caches POST /api/checkout/intent responses for 24h keyed by (tenant, key, body-hash). Defeats network-retry duplicate orders.';
