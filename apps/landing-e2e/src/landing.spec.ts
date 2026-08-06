import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PRODUCT_URL = 'https://nexus.openzentra.com';

test('renders the complete public story without product or identity requests', async ({ page }) => {
  const requestedUrls: string[] = [];
  page.on('request', (request) => requestedUrls.push(request.url()));

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: /governed runtime for analytical agents/i }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /trust is architecture/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /operate agents like infrastructure/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /build intelligence people can verify/i }),
  ).toBeVisible();

  expect(requestedUrls.some((url) => /clerk|\/api\/|\/v1\//i.test(url))).toBe(false);
});

test('links every primary action to the existing Nexus product', async ({ page }) => {
  await page.goto('/');

  const productLinks = page.getByRole('link', { name: /open nexus/i });
  await expect(productLinks).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(productLinks.nth(index)).toHaveAttribute('href', PRODUCT_URL);
  }
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`keeps the page readable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#security')).toBeVisible();
    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasPageOverflow).toBe(false);
    const operationsClipsContent = await page
      .locator('#operations')
      .evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(operationsClipsContent).toBe(false);
  });
}

test('honors the reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const animationDuration = await page
    .locator('.live-status > span')
    .evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(animationDuration)).toBeLessThan(0.1);
});

test('has no WCAG A or AA accessibility violations', async ({ page }) => {
  await page.goto('/');

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});
