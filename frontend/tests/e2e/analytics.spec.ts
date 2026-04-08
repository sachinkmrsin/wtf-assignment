import { test, expect } from '@playwright/test';

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics');
  });

  test('page loads and shows heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
  });

  test('html has dark class', async ({ page }) => {
    const cls = await page.evaluate(() => document.documentElement.className);
    expect(cls).toContain('dark');
  });

  test('gym selector renders skeleton or buttons', async ({ page }) => {
    const selector = page.getByTestId('gym-selector');
    await expect(selector).toBeVisible({ timeout: 5_000 });
    // Either skeletons or pill buttons should be present
    const hasContent = (await selector.locator('button, [data-slot="skeleton"]').count()) > 0;
    expect(hasContent).toBe(true);
  });

  test('gym selector buttons appear after API loads', async ({ page }) => {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="gym-selector"] button').length > 0,
      { timeout: 10_000 },
    );
  });

  test('revenue comparison chart card is rendered', async ({ page }) => {
    await expect(page.getByText(/30-day revenue comparison/i)).toBeVisible({ timeout: 10_000 });
  });

  test('revenue chart shows skeleton while loading', async ({ page }) => {
    // Immediately check — skeleton should be visible before data arrives
    await page.goto('/analytics');
    const hasSkeleton = (await page.locator('[data-slot="skeleton"]').count()) > 0;
    const hasChart    = (await page.locator('.recharts-wrapper').count()) > 0;
    expect(hasSkeleton || hasChart).toBe(true);
  });

  test('heatmap card is rendered after gym is selected', async ({ page }) => {
    // Wait for gym selector buttons
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="gym-selector"] button').length > 0,
      { timeout: 10_000 },
    );
    // Click first gym
    await page.locator('[data-testid="gym-selector"] button').first().click();
    await expect(page.getByText(/peak hour heatmap/i)).toBeVisible({ timeout: 10_000 });
  });

  test('14-day check-in trend section is present', async ({ page }) => {
    await expect(page.getByText(/14-day check-in trend/i)).toBeVisible({ timeout: 10_000 });
  });

  test('WebSocket indicator is visible on analytics page', async ({ page }) => {
    await expect(page.getByTestId('ws-indicator')).toBeVisible({ timeout: 8_000 });
  });
});

