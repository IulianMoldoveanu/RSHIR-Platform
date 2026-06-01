-- Courier onboarding fields (fleet marketplace Phase 3 — manager onboarding).
--
-- The fleet MANAGER onboards couriers via /fleet/couriers/invite with the
-- courier's full name, city/oraș, CNP and vehicle. This adds the two columns
-- that flow weren't capturing yet:
--
--   1. courier_profiles.city  — operational: which city the courier serves.
--      Nullable so it never breaks existing rows. Feeds future multi-city
--      zone scoping. Lives on courier_profiles (operational), not KYC.
--
--   2. courier_kyc.cnp_last4  — identity, MINIMIZED. CNP option 3 (locked by
--      Iulian): the platform NEVER persists a raw CNP. It stores only the
--      last 4 digits as an identity reference / dedup signal. The full CNP,
--      when needed for validation, is the fleet's responsibility once it
--      self-validates (courier_fleets.can_validate_couriers). The visual
--      identity proof remains the uploaded ID document (courier_kyc.id_doc_url),
--      where the full CNP is visible to the verifying admin without us storing
--      it as queryable text. Lives on courier_kyc (identity), behind the
--      stricter KYC RLS — not on the more widely-read courier_profiles.
--
-- Both columns are additive + nullable: zero behavior change for existing rows.

alter table public.courier_profiles
  add column if not exists city text;

comment on column public.courier_profiles.city is
  'Operational city/oraș the courier serves, captured at fleet-manager '
  'onboarding (/fleet/couriers/invite). Nullable. Feeds multi-city zone scoping.';

alter table public.courier_kyc
  add column if not exists cnp_last4 text
    check (cnp_last4 is null or cnp_last4 ~ '^[0-9]{4}$');

comment on column public.courier_kyc.cnp_last4 is
  'CNP option 3 (locked): platform stores ONLY the last 4 digits as an identity '
  'reference / dedup signal. The raw CNP is NEVER persisted by the platform — '
  'full CNP is the fleet''s responsibility when it self-validates '
  '(courier_fleets.can_validate_couriers). Visual identity proof = id_doc_url.';
