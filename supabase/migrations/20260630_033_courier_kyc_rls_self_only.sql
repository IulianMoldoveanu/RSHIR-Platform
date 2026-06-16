-- Tighten courier_kyc RLS to self-only (PII leak fix).
--
-- The previous policy (20260630_006) was:
--   using (courier_user_id = auth.uid() or fleet_id = current_courier_fleet_id())
-- The OR-branch let ANY courier in the same fleet read EVERY peer courier's KYC
-- row — legal_name, cui (fiscal code), id_doc_url (ID photo), selfie_url. That's
-- a PII / GDPR leak between riders who happen to share a fleet.
--
-- Fleet managers + platform admins read KYC via the service-role admin client
-- (createAdminClient bypasses RLS) — verified across fleet/actions.ts,
-- fleet/couriers/[id]/page.tsx, admin/verifications/*. The ONLY user-scoped
-- (RLS-applied) read is the courier viewing their OWN KYC (dashboard/kyc,
-- dashboard banner). So restricting to the self row breaks nothing legitimate
-- and closes the peer leak.
--
-- Idempotent: drop-and-recreate.

drop policy if exists courier_kyc_read on public.courier_kyc;
create policy courier_kyc_read on public.courier_kyc
  for select to authenticated
  using (courier_user_id = auth.uid());

comment on policy courier_kyc_read on public.courier_kyc is
  'Self-only read. Fleet managers + platform admins read via service_role '
  '(admin client). Tightened from the fleet-scoped policy that leaked peer KYC PII.';
