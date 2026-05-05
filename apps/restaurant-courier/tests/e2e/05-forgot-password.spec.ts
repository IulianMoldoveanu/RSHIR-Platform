import { test, expect } from '@playwright/test';
import { E2E_COURIER_EMAIL, seedCourier } from './fixtures/seed';

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
