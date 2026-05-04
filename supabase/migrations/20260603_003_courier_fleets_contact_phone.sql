-- Add a contact_phone column to courier_fleets so Mode C riders can
-- tap-to-call their fleet manager / dispatcher directly from the app.
-- Already applied to qfmeoj... via Supabase Management API on 2026-05-04.
-- Optional, additive, idempotent.

alter table public.courier_fleets
  add column if not exists contact_phone text;

comment on column public.courier_fleets.contact_phone is
  'Phone number of the fleet manager or dispatcher (E.164 format). Surfaced to Mode-C riders as a tap-to-call button. Optional.';
