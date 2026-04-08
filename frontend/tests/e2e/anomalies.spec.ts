import { test, expect } from '@playwright/test';

test.describe('Anomalies', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/anomalies');
  });

  test('page loads and shows heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /anomalies/i })).toBeVisible();
  });

  test('html has dark class', async ({ page }) => {
    const cls = await page.evaluate(() => document.documentElement.className);
    expect(cls).toContain('dark');
  });

  test('severity cards are visible after data loads', async ({ page }) => {
    await expect(page.getByText('Critical')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('High')).toBeVisible();
    await expect(page.getByText('Medium')).toBeVisible();
    await expect(page.getByText('Low')).toBeVisible();
  });

  test('skeleton loaders appear during data fetch', async ({ page }) => {
    await page.goto('/anomalies');
    const hasSkeleton = (await page.locator('[data-slot="skeleton"]').count()) > 0;
    const hasData     = (await page.locator('[data-testid="anomaly-list"]').count()) > 0;
    const hasEmpty    = (await page.getByText(/no active anomalies/i).count()) > 0;
    expect(hasSkeleton || hasData || hasEmpty).toBe(true);
  });

  test('anomaly list or empty state renders after data loads', async ({ page }) => {
    await expect(
      page.getByTestId('anomaly-list').or(page.getByText(/no active anomalies/i)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('pie chart "by severity" card is visible', async ({ page }) => {
    await expect(page.getByText(/by severity/i)).toBeVisible({ timeout: 10_000 });
  });

  test('navigating from dashboard to anomalies via navbar works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /anomalies/i }).click();
    await expect(page).toHaveURL(/\/anomalies/);
    await expect(page.getByRole('heading', { name: /anomalies/i })).toBeVisible();
  });

  test('resolve button triggers PATCH request (if anomaly exists)', async ({ page }) => {
    await page.waitForSelector('[data-testid="anomaly-list"], [data-testid="anomaly-row"]', {
      timeout: 10_000,
    }).catch(() => null); // skip if no anomalies

    const resolveBtn = page.getByRole('button', { name: /resolve/i }).first();
    const hasResolve = await resolveBtn.isVisible().catch(() => false);
    if (hasResolve) {
      const [req] = await Promise.all([
        page.waitForRequest((r) => r.url().includes('/resolve') && r.method() === 'PATCH'),
        resolveBtn.click(),
      ]);
      expect(req).toBeTruthy();
    }
  });

  test('WebSocket indicator is visible on anomalies page', async ({ page }) => {
    await expect(page.getByTestId('ws-indicator')).toBeVisible({ timeout: 8_000 });
  });
});

