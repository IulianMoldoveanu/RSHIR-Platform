-- Configurable Hepi identity, per tenant.
--
-- Owners asked to configure "who Hepi is" for their restaurant — a name and
-- a tone — so the assistant that talks to them on Telegram/WhatsApp feels
-- like theirs, not a generic bot. Today the persona is a hardcoded system
-- prompt; this table makes the two owner-facing bits (name + tone) data.
--
-- Scope: one row per tenant. Both fields optional — absent/empty means Hepi
-- falls back to its default persona (see buildPersonaPreamble in
-- _shared/hepy-brain.ts). Nothing here changes what Hepi is ALLOWED to do —
-- that stays governed by tenant_agent_trust. This is presentation only.
--
-- RLS: service_role only. Every reader/writer is a server surface — the
-- Edge Function (service-role) reading the persona to build the prompt, and
-- the OWNER-gated admin server action writing it (also service-role, after
-- it has verified OWNER membership in app code, same as the WhatsApp binding
-- actions). Additive, idempotent.

create table if not exists public.tenant_hepi_persona (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  -- What the owner calls the assistant (e.g. "Ana", "Chef"). NULL/empty →
  -- default "Hepi".
  assistant_name text,
  -- Free-text tone/personality guidance injected into the system prompt
  -- (e.g. "prietenos, direct, fără jargon"). Capped in app code; the column
  -- is generous. NULL/empty → default neutral-professional tone.
  persona_tone text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.tenant_hepi_persona enable row level security;

drop policy if exists "service_role_all_tenant_hepi_persona" on public.tenant_hepi_persona;
create policy "service_role_all_tenant_hepi_persona"
  on public.tenant_hepi_persona
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.tenant_hepi_persona is
  'Per-tenant configurable Hepi identity (assistant_name + persona_tone) injected '
  'into the assistant system prompt. Presentation only — does NOT affect what Hepi '
  'may do (that is tenant_agent_trust). Read/written by service-role server surfaces '
  '(Edge Function prompt builder + OWNER-gated admin action).';
