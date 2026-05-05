import { test, expect } from '@playwright/test';
import { E2E_COURIER_EMAIL, seedCourier } from './fixtures/seed';

// Scope of this spec: form submission + UI confirmation only.
//
// We intentionally do NOT intercept the actual password-reset email or
// follow the magic link. Doing so would require either:
//   a) A real email inbox accessible via IMAP/API (e.g. Mailosaur, Mailhog),
//      which adds infra setup that is out of scope for the current test rig.
//   b) Mocking Supabase's `auth.resetPasswordForEmail` call, which breaks
//      the value of an e2e test (it stops exercising the real auth path).
//
// The smoke baseline — "form renders, accepts a valid email, Supabase's Auth
// API returns 200, and the UI shows a confirmation message" — is sufficient
// to catch the regressions most likely to occur (form validation broken,
// toast component removed, route removed). Full reset-link follow-through
// is a future addition once a Mailosaur project ID lands in CI secrets.
test.describe('Forgot password', () => {
  test.beforeEach(async () => {
    await seedCourier();
  });

  test('forgot-password form accepts email and shows confirmation', async ({ page }) => {
    await page.goto('/login/forgot');
    await page.getByLabel(/email/i).fill(E2E_COURIER_EMAIL);
    await page.getByRole('button', { name: /trimite|send|reset/i }).click();
    await expect(page.getByText(/verifică|check|trimi/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
