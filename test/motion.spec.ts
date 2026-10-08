import { test, expect } from "@playwright/test";

test("prices flash on ticks", async ({ page }) => {
  await page.goto("/");
  const flashed = page
    .locator('[data-testid^="price-"][data-flash="up"], [data-testid^="price-"][data-flash="down"]')
    .first();
  await expect(flashed).toBeVisible({ timeout: 10_000 });
  await expect(flashed).toHaveClass(/animate-flash-/);
});

test("sparklines draw from the stream", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sparkline-AAPL").locator("canvas").first()).toBeVisible({ timeout: 10_000 });
});
