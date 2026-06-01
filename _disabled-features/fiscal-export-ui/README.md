# Fiscal export UI — temporarily disabled

**Disabled date:** 2026-05-20
**Owner:** Iulian
**Decision source:** "fa sa nu fie vizibil exportul fiscal" (chat directive)

## What was disabled

The per-order admin button that triggers a manual bon-fiscal print through a Custom-webhook adapter (Datecs companion, e-Factura, SmartBill, etc.).

## Where the disabled code lives

The component is at its original location but is GATED by an env var.

- `apps/restaurant-admin/src/app/dashboard/orders/[id]/fiscal-receipt-button.tsx`
  - Returns `null` unless `NEXT_PUBLIC_FISCAL_EXPORT_UI === 'true'`

The page that hosts the button (`apps/restaurant-admin/src/app/dashboard/orders/[id]/page.tsx`) still passes props — they're just unused when the button doesn't render.

## How to re-enable

1. Set `NEXT_PUBLIC_FISCAL_EXPORT_UI=true` in Vercel env vars on the restaurant-admin project
2. Trigger redeploy
3. Button reappears on order detail pages where the tenant has a Custom-webhook provider configured

## Reactivation criteria

After:
- SmartBill official ISV onboarding complete
- ANAF e-Factura per-tenant credentials wired in `tenant.settings.fiscal`
- Or first 5 tenants explicitly requesting fiscal export feature

Estimate: Q3 2026 or after first 5 tenants request it.

## Notes for re-enabler

- Backend server action `printFiscalReceipt` in `apps/restaurant-admin/src/app/dashboard/orders/actions.ts` is UNTOUCHED — still works
- The integration-bus + Custom-webhook adapter flow still exists
- Re-enable is just the env var flip + redeploy
