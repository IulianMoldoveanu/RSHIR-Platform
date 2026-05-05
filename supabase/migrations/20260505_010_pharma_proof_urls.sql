-- HIR Courier — persist pharma id + prescription proof URLs (additive).
--
-- Audit-confirmed bug: markDeliveredAction only writes delivered_proof_url
-- (the delivery photo). Pharma orders that capture id + prescription
-- proofs upload them to courier-proofs but the URLs were not stored on
-- the order — gone from the system after delivery. For compliance and
-- dispute resolution we need them on the row.
--
-- Strictly additive. NULL is fine for pre-existing rows + restaurant
-- orders that don't capture these proofs.

alter table public.courier_orders
  add column if not exists delivered_proof_id_url text,
  add column if not exists delivered_proof_prescription_url text;

comment on column public.courier_orders.delivered_proof_id_url is
  'Pharma delivery: photo of recipient ID. Set when pharma_metadata.requires_id_check=true and the courier captures the photo at delivery. Stored as a courier-proofs bucket URL — server-side host allowlist enforces.';
comment on column public.courier_orders.delivered_proof_prescription_url is
  'Pharma delivery: photo of prescription confirmation. Set when pharma_metadata.requires_prescription=true.';
