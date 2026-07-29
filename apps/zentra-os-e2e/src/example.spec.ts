import { expect, test } from '@playwright/test';

test('shows an explicit identity setup state without Clerk configuration', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /connect clerk/i })).toBeVisible();
  await expect(page.getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeVisible();
});
