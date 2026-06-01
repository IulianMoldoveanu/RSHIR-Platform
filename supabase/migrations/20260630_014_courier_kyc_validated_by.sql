-- Records WHO validated a courier's KYC (fleet marketplace Phase 3 — P4c).
--
-- By default the PLATFORM verifies couriers. But a fleet with
-- courier_fleets.can_validate_couriers = true may verify its OWN couriers and,
-- by doing so, assume responsibility for their data (the liability shift Iulian
-- wants: "ei vor fi total responsabili de datele lor"). This durably records
-- that responsibility — a column on the KYC row, not just an audit entry — so
-- who-validated-whom can be proven later.
--
-- Additive + nullable: existing VERIFIED rows simply have a null validated_by.

alter table public.courier_kyc
  add column if not exists validated_by text
    check (validated_by is null or validated_by in ('PLATFORM', 'FLEET'));

alter table public.courier_kyc
  add column if not exists validated_by_user_id uuid;

comment on column public.courier_kyc.validated_by is
  'Who recorded the verification decision: PLATFORM (default) or FLEET (when the '
  'fleet has can_validate_couriers and self-validates, assuming data responsibility).';
comment on column public.courier_kyc.validated_by_user_id is
  'The platform admin or fleet owner (auth user) who recorded the decision.';
