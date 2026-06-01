-- Masked call sessions (fleet marketplace Phase 4 — Wolt-style call masking).
--
-- Neither the customer nor the courier should see the other's real number.
-- A Twilio Proxy session assigns each participant a proxy number: the courier
-- dials courier_proxy_number to reach the customer; the customer dials
-- client_proxy_number to reach the courier. We persist the session reference +
-- the two proxy numbers per courier_order so taps reuse one session.
--
-- Lifecycle: created lazily on the first "Sună acum" during an active delivery
-- (ACCEPTED..IN_TRANSIT) and expires via the Twilio session TTL (no raw number
-- ever leaves the server once masking is enabled).
--
-- Default-deny RLS: only the server (service_role, via the masking route)
-- touches this table. Additive + behind a feature flag — zero effect until
-- CALL_MASKING_ENABLED + a Twilio Proxy service are provisioned.

create table if not exists public.courier_call_sessions (
  courier_order_id     uuid primary key,
  twilio_session_sid   text,
  courier_proxy_number text,        -- the courier dials this to reach the customer
  client_proxy_number  text,        -- the customer dials this to reach the courier
  status               text not null default 'OPEN',   -- OPEN | CLOSED
  created_at           timestamptz not null default now(),
  expires_at           timestamptz,
  closed_at            timestamptz
);

comment on table public.courier_call_sessions is
  'Fleet marketplace Phase 4: Twilio Proxy masked-call session per courier_order. '
  'Stores the session SID + each party''s proxy number so neither sees the '
  'other''s real phone. Server-only (default-deny RLS); behind CALL_MASKING_ENABLED.';

alter table public.courier_call_sessions enable row level security;
-- No policies: server-only via service_role (which bypasses RLS).
