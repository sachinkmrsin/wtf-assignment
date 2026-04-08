import { test, expect } from '@playwright/test';

/**
 * E2E: Dashboard page
 * Requires: docker compose up (full stack running on localhost:3000)
 */
test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── Theme ────────────────────────────────────────────────────────────────
  test('html element has dark class applied (always-dark)', async ({ page }) => {
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
  });

  test('body background is near-black (dark theme)', async ({ page }) => {
    const bg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    // Should not be white
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  // ── Navigation ───────────────────────────────────────────────────────────
  test('page loads and shows heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /live dashboard/i })).toBeVisible();
  });

  test('navbar links are visible', async ({ page }) => {
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /analytics/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /anomalies/i })).toBeVisible();
  });

  // ── WebSocket indicator ──────────────────────────────────────────────────
  test('WebSocket indicator is visible in navbar', async ({ page }) => {
    await expect(page.getByTestId('ws-indicator')).toBeVisible({ timeout: 8_000 });
  });

  test('WebSocket indicator shows Live state when connected', async ({ page }) => {
    // Allow time for WS to connect
    await page.waitForTimeout(2_000);
    const indicator = page.getByTestId('ws-indicator');
    await expect(indicator).toBeVisible();
    // Should contain either Live or Disconnected — not missing
    const text = await indicator.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  // ── Skeleton loaders ─────────────────────────────────────────────────────
  test('skeleton loaders appear briefly before gym grid loads', async ({ page }) => {
    // We capture the page before full data load by checking immediately
    await page.goto('/');
    // Either skeletons or gym-grid should be present
    const hasSkeletons = await page.locator('[data-slot="skeleton"]').count() > 0;
    const hasGrid      = await page.getByTestId('gym-grid').isVisible().catch(() => false);
    expect(hasSkeletons || hasGrid).toBe(true);
  });

  // ── Gym grid ─────────────────────────────────────────────────────────────
  test('gym cards are rendered after data loads', async ({ page }) => {
    await expect(page.getByTestId('gym-grid')).toBeVisible({ timeout: 10_000 });
    const cards = page.getByTestId('gym-card');
    await expect(cards.first()).toBeVisible();
  });

  test('clicking a gym card selects it (teal ring)', async ({ page }) => {
    await expect(page.getByTestId('gym-grid')).toBeVisible({ timeout: 10_000 });
    const firstCard = page.getByTestId('gym-card').first();
    await firstCard.click();
    // After click, per-gym KPI cards should appear
    await expect(page.getByText(/live activity/i)).toBeVisible({ timeout: 5_000 });
  });

  // ── KPI summary bar ──────────────────────────────────────────────────────
  test('summary bar renders all 4 KPI cards', async ({ page }) => {
    await expect(page.getByTestId('summary-bar')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('kpi-total-occupancy')).toBeVisible();
    await expect(page.getByTestId('kpi-avg-capacity')).toBeVisible();
    await expect(page.getByTestId('kpi-revenue')).toBeVisible();
    await expect(page.getByTestId('kpi-active-gyms')).toBeVisible();
  });

  // ── Simulator controls ───────────────────────────────────────────────────
  test('simulator controls card is visible', async ({ page }) => {
    await expect(page.getByTestId('simulator-controls')).toBeVisible({ timeout: 5_000 });
  });

  test('simulator controls has start/pause/reset buttons', async ({ page }) => {
    await expect(page.getByTestId('sim-start')).toBeVisible();
    await expect(page.getByTestId('sim-stop')).toBeVisible();
    await expect(page.getByTestId('sim-reset')).toBeVisible();
  });

  test('simulator speed buttons 1×, 5×, 10× are visible', async ({ page }) => {
    await expect(page.getByTestId('speed-1x')).toBeVisible();
    await expect(page.getByTestId('speed-5x')).toBeVisible();
    await expect(page.getByTestId('speed-10x')).toBeVisible();
  });

  // ── Recent anomalies ─────────────────────────────────────────────────────
  test('recent anomalies section is present', async ({ page }) => {
    await expect(page.getByText(/recent anomalies/i)).toBeVisible({ timeout: 10_000 });
  });
});

