-- MedicalAccessLog — per-actor audit trail for pharma access.
--
-- Per F2.2 of the courier master plan and DPA-TEMPLATE-2026-05-13.md, every
-- view of a pharma customer's name / address / prescription detail by a
-- courier or dispatcher must be logged. The log is the evidence trail we
-- show during a Legea 95 inspection or a GDPR Art.30 records-of-processing
-- request.
--
-- Distinct from audit_log:
--   - audit_log records ACTIONS the actor performed on data (state changes,
--     uploads, mutations).
--   - medical_access_logs records VIEWS — read access to medical-grade PII.
--     The same delivery row may be viewed dozens of times without a single
--     audit_log entry being added.
--
-- 5-year retention per DPA template. Purge cron added in a follow-up
-- migration; for now keep all rows.

create table if not exists public.medical_access_logs (
  id            bigserial primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  entity_type   text not null,
  entity_id     uuid not null,
  purpose       text not null,
  accessed_at   timestamptz not null default now(),
  ip            inet,
  user_agent    text,
  metadata      jsonb default '{}'::jsonb,
  constraint medical_access_logs_entity_type_check
    check (entity_type in (
      'courier_order',
      'pharma_anamnesis',
      'pharma_prescription',
      'pharma_patient'
    )),
  constraint medical_access_logs_purpose_check
    check (purpose in (
      'delivery',
      'dispatch',
      'audit',
      'support',
      'compliance_inspection'
    ))
);

-- Most frequent queries: "show all accesses for entity X" (compliance
-- response) and "show all accesses by actor Y in the last 30 days"
-- (anomaly review). Two narrow indexes serve both without paying for a
-- composite that would only help niche queries.
create index if not exists medical_access_logs_entity_idx
  on public.medical_access_logs (entity_type, entity_id, accessed_at desc);

create index if not exists medical_access_logs_actor_recent_idx
  on public.medical_access_logs (actor_user_id, accessed_at desc);

-- RLS: tenant admins / platform admins can read for their own tenants
-- through the existing courier_orders → fleet → tenant chain. Riders
-- cannot read this table at all — it's a one-way write surface.
--
-- For now, lock down both INSERT and SELECT to service_role only. The
-- helper that writes uses createAdminClient(); the dispatcher UI that
-- reads goes through a server component using admin too. Tighter
-- per-tenant SELECT policies can be added once we have a real
-- dispatcher surface that reads this table.
alter table public.medical_access_logs enable row level security;

create policy medical_access_logs_service_role_all
  on public.medical_access_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.medical_access_logs is
  'Append-only audit of read access to pharma PII (Legea 95 / GDPR Art.30). 5-year retention per DPA-TEMPLATE-2026-05-13.';
comment on column public.medical_access_logs.purpose is
  'Why the actor accessed the row. CHECK-constrained to the closed set of legitimate purposes; rejecting writes with an unrecognized purpose is the forcing function for callers to declare intent.';
