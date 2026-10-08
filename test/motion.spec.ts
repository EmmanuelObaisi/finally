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
  const canvases = page.getByTestId("sparkline-AAPL").locator("canvas");
  await expect(canvases.first()).toBeVisible({ timeout: 10_000 });
  // An empty chart still has canvases; a drawn line leaves non-transparent pixels on one of them.
  await expect
    .poll(
      () =>
        canvases.evaluateAll((all) =>
          all.some((c) => {
            const canvas = c as HTMLCanvasElement;
            const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
            return data.some((v, i) => i % 4 === 3 && v > 0);
          }),
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
});
