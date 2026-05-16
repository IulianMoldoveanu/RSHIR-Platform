# `e2e/_setup` — shared E2E fixtures

Service-role seed + teardown helpers used by the happy-path Playwright suites.
Test-time only — these files must NEVER be imported from `apps/**` or `packages/**`.

## Files

| File | Purpose |
| --- | --- |
| `demo-tenant-seed.ts` | `seedDemoTenant()` — idempotent create/update of the canonical `e2e-demo` tenant, its menu, optional courier profile, and tenant payment settings. Returns the ids needed by the specs. |
| `demo-tenant-teardown.ts` | `cleanupDemoTenant(tenantId)` — drops the tenant row (cascades child tables) and removes the courier auth user. |
| `demo-tenant-seed.test.ts` | Vitest unit tests with the Supabase client mocked. Asserts idempotency + insert shape — no real DB hit. |

## Env requirements

The seed/teardown helpers require service-role access:

- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) — the project URL
- `SUPABASE_SERVICE_ROLE_KEY` — the service-role key (bypasses RLS)

In CI these come from secrets. Locally put them in `e2e/happy-paths/.env.local`
(gitignored). The Playwright config in `e2e/happy-paths/playwright.config.ts`
already loads `.env.local` on top of `.env.test`.

## Usage from a Playwright spec

```ts
import { seedDemoTenant } from '../_setup/demo-tenant-seed';
import { cleanupDemoTenant } from '../_setup/demo-tenant-teardown';

let seeded: Awaited<ReturnType<typeof seedDemoTenant>> | undefined;

test.beforeAll(async () => {
  seeded = await seedDemoTenant({ paymentMode: { mode: 'cod_only' } });
});

test.afterAll(async () => {
  if (seeded) await cleanupDemoTenant(seeded.tenantId);
});
```

For card-sandbox flows pass `{ mode: 'card_sandbox', provider: 'netopia' | 'viva' }`.
Add `withCourier: true` to also seed `e2e-courier@test.hir.ro` + a
`courier_profiles` row tied to the demo tenant.

## Running the unit test

```bash
pnpm --filter @hir/e2e-setup test
# or
pnpm -w exec vitest run e2e/_setup/demo-tenant-seed.test.ts
```

The unit test does NOT hit Supabase — it mocks the client end-to-end.
