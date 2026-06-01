-- Fleet identity prefix + delegated courier validation (fleet marketplace Phase 3).
--
-- display_prefix: a short fleet acronym (e.g. "HIR") shown in front of a
-- courier's name in operational views, so dispatch instantly sees which fleet a
-- courier belongs to (Wolt-style). Pure visibility/control.
--
-- can_validate_couriers: per-fleet switch (default FALSE = platform validates).
-- When TRUE, the fleet may validate its own couriers' KYC and takes full
-- responsibility for that data (shifts liability off the platform). The admin
-- toggles this per fleet; the verification panel will honor it.
--
-- Both additive; default behavior unchanged.

alter table public.courier_fleets
  add column if not exists display_prefix        text,
  add column if not exists can_validate_couriers boolean not null default false;

comment on column public.courier_fleets.display_prefix is
  'Short fleet acronym (e.g. HIR) prefixed to courier names in operational views '
  'so dispatch sees the fleet at a glance.';

comment on column public.courier_fleets.can_validate_couriers is
  'When true, this fleet may validate its own couriers'' KYC (and owns that data '
  'responsibility). Default false = platform validates. Per-fleet operator switch.';
