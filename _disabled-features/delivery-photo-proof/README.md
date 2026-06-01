# Delivery photo proof — temporarily disabled

**Disabled date:** 2026-05-20
**Owner:** Iulian
**Decision source:** "fotografiile cu livrările vor fi dezactivate" (chat directive)

## What was disabled

Customer-facing photo proof of delivery for **restaurant orders only**. Photo proof remains active for **pharma orders** with `requiresId` or `requiresPrescription` (legal requirement).

## Where the disabled code lives

The component is still at its original location but is GATED by an env var.

- `apps/restaurant-courier/src/components/photo-proof-upload.tsx`
  - Returns `null` unless `NEXT_PUBLIC_DELIVERY_PHOTO_PROOF === 'true'`
  - Calls `onComplete({})` immediately when disabled so the delivery flow proceeds
  - Pharma-required path (legal) is bypass — stays enabled regardless of flag

## How to re-enable

1. Set `NEXT_PUBLIC_DELIVERY_PHOTO_PROOF=true` in Vercel env vars on the courier project (and any web/admin apps that read the proof URL)
2. Trigger redeploy
3. The component will render the original UI

## Reactivation criteria

After 100+ orders/day when proof is needed for dispute resolution (per Iulian).

## Notes for re-enabler

- The Supabase storage bucket `courier-proofs` still exists (privacy already addressed in batch 2 B13 follow-up)
- DB columns `delivered_proof_url`, `delivered_proof_taken_at`, `delivered_proof_id_url`, `delivered_proof_prescription_url` still exist on `courier_orders` — schema unchanged
- The Edge Function for upload + signing still exists
- Re-enable is just the env var flip + redeploy
