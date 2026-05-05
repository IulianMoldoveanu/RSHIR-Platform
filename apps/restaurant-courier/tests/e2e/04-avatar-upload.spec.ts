import { test, expect } from '@playwright/test';
import path from 'node:path';
import { seedCourier } from './fixtures/seed';
import { loginAsTestCourier } from './helpers/auth';

test.describe('Avatar upload', () => {
  test.beforeEach(async () => {
    await seedCourier();
  });

  test.fixme('upload avatar shows preview in header', async ({ page }) => {
    await loginAsTestCourier(page);
    await page.goto('/dashboard/profile');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(path.resolve(__dirname, 'assets/avatar.jpg'));

    // The header avatar should swap from initials to the uploaded image.
    await expect(page.locator('header img[alt*="avatar" i]').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
