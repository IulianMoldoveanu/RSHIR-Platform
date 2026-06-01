-- Courier KYC foundation (fleet marketplace Phase 3).
--
-- WHY this matters most: the strongest anti-disintermediation lever is not
-- hiding the vendor (a courier reads the firm off the door) or contracts
-- (mutable in RO) -- it is INDIVIDUAL courier identity. Per-person KYC is what
-- kills re-brokering (one "courier" account reselling work to unvetted drivers),
-- which is the dominant fraud vector in freight. device_fingerprints[] surfaces
-- the same device hopping between "different" courier accounts.
--
-- This ships the FOUNDATION only -- the table, a courier-self submission RPC,
-- the verified-check helper, and RLS. It deliberately does NOT yet block
-- offers on kyc_status (that flip would strand every existing courier who has
-- no KYC row). Enforcement (offer_courier_order requires VERIFIED) becomes a
-- per-fleet operational switch once that fleet's couriers are onboarded; the
-- helper below is ready for it.

create table if not exists public.courier_kyc (
  courier_user_id     uuid primary key,
  fleet_id            uuid,                          -- copied from courier_profiles at submit
  legal_name          text,
  cui                 text,                          -- PFA/SRL fiscal code (nullable)
  id_doc_url          text,
  selfie_url          text,
  kyc_status          text not null default 'PENDING'
                        check (kyc_status in ('PENDING','VERIFIED','REJECTED')),
  device_fingerprints text[] not null default '{}',  -- anti re-brokering signal
  rejected_reason     text,
  submitted_at        timestamptz,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_courier_kyc_fleet  on public.courier_kyc (fleet_id);
create index if not exists idx_courier_kyc_status on public.courier_kyc (kyc_status);

comment on table public.courier_kyc is
  'Fleet marketplace Phase 3: per-courier identity verification. The core '
  'anti-re-brokering control. Submissions via submit_courier_kyc() (status '
  'forced PENDING); verification (->VERIFIED) only by platform via service_role. '
  'device_fingerprints[] flags one device across multiple courier accounts.';

-- Courier self-submission. SECURITY DEFINER so the courier can write their row
-- without the table being open; status is forced PENDING (a courier can never
-- self-verify) and fleet_id is taken from their courier_profiles row (not
-- client-supplied). Re-submission appends the device fingerprint (deduped).
create or replace function public.submit_courier_kyc(
  p_legal_name        text,
  p_cui               text default null,
  p_id_doc_url        text default null,
  p_selfie_url        text default null,
  p_device_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_fleet uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select fleet_id into v_fleet from public.courier_profiles where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_a_courier');
  end if;

  insert into public.courier_kyc as k (
    courier_user_id, fleet_id, legal_name, cui, id_doc_url, selfie_url,
    kyc_status, device_fingerprints, submitted_at, updated_at
  ) values (
    v_uid, v_fleet, p_legal_name, p_cui, p_id_doc_url, p_selfie_url,
    'PENDING',
    case when p_device_fingerprint is not null then array[p_device_fingerprint] else '{}' end,
    now(), now()
  )
  on conflict (courier_user_id) do update set
    fleet_id      = v_fleet,
    legal_name    = excluded.legal_name,
    cui           = excluded.cui,
    id_doc_url    = excluded.id_doc_url,
    selfie_url    = excluded.selfie_url,
    kyc_status    = 'PENDING',                       -- re-submission re-enters review
    rejected_reason = null,
    submitted_at  = now(),
    updated_at    = now(),
    device_fingerprints = (
      select array(
        select distinct e from unnest(
          k.device_fingerprints ||
          case when p_device_fingerprint is not null then array[p_device_fingerprint] else '{}' end
        ) as e
      )
    );

  return jsonb_build_object('ok', true, 'status', 'PENDING');
end;
$$;

comment on function public.submit_courier_kyc(text, text, text, text, text) is
  'Fleet marketplace Phase 3: courier self-submits KYC docs. Forces PENDING + '
  'takes fleet_id from courier_profiles (no self-verify, no fleet spoofing). '
  'Appends a deduped device fingerprint.';

revoke all on function public.submit_courier_kyc(text, text, text, text, text) from public, anon;
grant execute on function public.submit_courier_kyc(text, text, text, text, text) to authenticated, service_role;

-- Verified-check helper, ready for offer-time enforcement (Phase 3 cap PR).
create or replace function public.courier_is_kyc_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.courier_kyc
    where courier_user_id = p_user_id and kyc_status = 'VERIFIED'
  );
$$;

comment on function public.courier_is_kyc_verified(uuid) is
  'Fleet marketplace Phase 3: true if the courier has a VERIFIED KYC row. For '
  'offer-time enforcement once per-fleet KYC is switched on.';

revoke all on function public.courier_is_kyc_verified(uuid) from public, anon;
grant execute on function public.courier_is_kyc_verified(uuid) to authenticated, service_role;

-- RLS: courier reads own; fleet members read their fleet's; platform via
-- service_role. No direct write policies -- writes flow through the RPC
-- (definer) + service_role for verification.
alter table public.courier_kyc enable row level security;

drop policy if exists courier_kyc_read on public.courier_kyc;
create policy courier_kyc_read on public.courier_kyc
  for select to authenticated
  using (courier_user_id = auth.uid() or fleet_id = public.current_courier_fleet_id());
