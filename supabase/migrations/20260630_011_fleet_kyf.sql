-- Know Your Fleet (KYF) — fleet legitimacy onboarding (fleet marketplace Phase 3).
--
-- The company-level analogue of courier KYC. Before a fleet can operate it must
-- prove it's a real, active courier company: CUI (auto-validated via the free
-- ANAF public API -> name, address, ONRC reg number, CAEN, VAT, active status)
-- plus uploaded documents (act constitutiv, extras de cont, certificat
-- înregistrare) that ANAF doesn't expose. The platform (not the fleet) verifies.
--
-- This is the foundation: the fleet_kyf table, a private docs bucket, the
-- owner-submission RPC, and a verified-check helper for the operate-gate. The
-- onboarding form + admin verification panel + the gate are follow-ups.
--
-- Additive. Verification (-> VERIFIED) is service_role-only (platform).

create table if not exists public.fleet_kyf (
  fleet_id             uuid primary key references public.courier_fleets(id) on delete cascade,
  cui                  text,
  company_name         text,          -- from ANAF
  reg_com              text,          -- nr. ONRC (J.../...), from ANAF
  caen_code            text,          -- from ANAF (expect 5320 / courier)
  address              text,          -- from ANAF
  vat_payer            boolean,       -- from ANAF
  anaf_active          boolean,       -- firm active (not radiată/inactivă), from ANAF
  anaf_checked_at      timestamptz,
  iban                 text,
  act_constitutiv_url  text,          -- storage path (private bucket)
  extras_cont_url      text,
  certificat_inreg_url text,
  kyf_status           text not null default 'PENDING'
                         check (kyf_status in ('PENDING','VERIFIED','REJECTED')),
  rejected_reason      text,
  submitted_at         timestamptz,
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_fleet_kyf_status on public.fleet_kyf (kyf_status);

comment on table public.fleet_kyf is
  'Fleet marketplace Phase 3: Know Your Fleet. Company legitimacy per courier_fleet '
  '(CUI auto-validated via ANAF + uploaded act constitutiv / extras de cont / '
  'certificat). Verification (->VERIFIED) is platform-only via service_role.';

-- Owner submission RPC. SECURITY DEFINER; only the fleet OWNER may submit, status
-- is forced PENDING (no self-verify). ANAF fields are server-fetched and passed
-- in by the onboarding action; doc fields are storage paths in the private bucket.
create or replace function public.submit_fleet_kyf(
  p_fleet_id             uuid,
  p_cui                  text,
  p_company_name         text default null,
  p_reg_com              text default null,
  p_caen_code            text default null,
  p_address              text default null,
  p_vat_payer            boolean default null,
  p_anaf_active          boolean default null,
  p_iban                 text default null,
  p_act_constitutiv_url  text default null,
  p_extras_cont_url      text default null,
  p_certificat_inreg_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select owner_user_id into v_owner from public.courier_fleets where id = p_fleet_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'reason', 'fleet_not_found');
  end if;
  if v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'reason', 'not_fleet_owner');
  end if;

  insert into public.fleet_kyf as k (
    fleet_id, cui, company_name, reg_com, caen_code, address, vat_payer,
    anaf_active, anaf_checked_at, iban, act_constitutiv_url, extras_cont_url,
    certificat_inreg_url, kyf_status, submitted_at, updated_at
  ) values (
    p_fleet_id, p_cui, p_company_name, p_reg_com, p_caen_code, p_address, p_vat_payer,
    p_anaf_active, case when p_company_name is not null then now() else null end, p_iban,
    p_act_constitutiv_url, p_extras_cont_url, p_certificat_inreg_url,
    'PENDING', now(), now()
  )
  on conflict (fleet_id) do update set
    cui                  = excluded.cui,
    company_name         = coalesce(excluded.company_name, k.company_name),
    reg_com              = coalesce(excluded.reg_com, k.reg_com),
    caen_code            = coalesce(excluded.caen_code, k.caen_code),
    address              = coalesce(excluded.address, k.address),
    vat_payer            = coalesce(excluded.vat_payer, k.vat_payer),
    anaf_active          = coalesce(excluded.anaf_active, k.anaf_active),
    anaf_checked_at      = coalesce(excluded.anaf_checked_at, k.anaf_checked_at),
    iban                 = coalesce(excluded.iban, k.iban),
    act_constitutiv_url  = coalesce(excluded.act_constitutiv_url, k.act_constitutiv_url),
    extras_cont_url      = coalesce(excluded.extras_cont_url, k.extras_cont_url),
    certificat_inreg_url = coalesce(excluded.certificat_inreg_url, k.certificat_inreg_url),
    kyf_status           = 'PENDING',   -- re-submission re-enters review
    rejected_reason      = null,
    submitted_at         = now(),
    updated_at           = now();

  return jsonb_build_object('ok', true, 'status', 'PENDING');
end;
$$;

comment on function public.submit_fleet_kyf is
  'Fleet marketplace Phase 3: fleet owner submits KYF (company data + doc paths). '
  'Forces PENDING; only the fleet owner. coalesce preserves prior docs on partial '
  're-submit.';

revoke all on function public.submit_fleet_kyf(uuid, text, text, text, text, text, boolean, boolean, text, text, text, text) from public, anon;
grant execute on function public.submit_fleet_kyf(uuid, text, text, text, text, text, boolean, boolean, text, text, text, text) to authenticated, service_role;

-- Verified-check helper, ready for the operate-gate (a fleet operates only when
-- KYF VERIFIED). Null-row / no-KYF fleets are treated by callers per a per-fleet
-- flag so existing fleets aren't stranded.
create or replace function public.fleet_is_kyf_verified(p_fleet_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.fleet_kyf
    where fleet_id = p_fleet_id and kyf_status = 'VERIFIED'
  );
$$;

comment on function public.fleet_is_kyf_verified(uuid) is
  'Fleet marketplace Phase 3: true if the fleet has a VERIFIED fleet_kyf row.';

revoke all on function public.fleet_is_kyf_verified(uuid) from public, anon;
grant execute on function public.fleet_is_kyf_verified(uuid) to authenticated, service_role;

-- RLS: fleet owner reads their own KYF; platform via service_role. Writes via
-- the RPC (definer) + service_role verification only.
alter table public.fleet_kyf enable row level security;

drop policy if exists fleet_kyf_owner_read on public.fleet_kyf;
create policy fleet_kyf_owner_read on public.fleet_kyf
  for select to authenticated
  using (
    exists (
      select 1 from public.courier_fleets cf
      where cf.id = fleet_kyf.fleet_id and cf.owner_user_id = auth.uid()
    )
  );

-- Private docs bucket: fleet owner uploads to fleet-kyf/{fleet_id}/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fleet-kyf',
  'fleet-kyf',
  false,
  10 * 1024 * 1024,                         -- 10 MB — PDFs/scans of company docs
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fleet_kyf_owner_insert" on storage.objects;
create policy "fleet_kyf_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fleet-kyf'
  and exists (
    select 1 from public.courier_fleets cf
    where cf.id::text = (storage.foldername(name))[1]
      and cf.owner_user_id = auth.uid()
  )
);

drop policy if exists "fleet_kyf_owner_select" on storage.objects;
create policy "fleet_kyf_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fleet-kyf'
  and exists (
    select 1 from public.courier_fleets cf
    where cf.id::text = (storage.foldername(name))[1]
      and cf.owner_user_id = auth.uid()
  )
);
