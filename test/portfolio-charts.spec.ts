import { test, expect } from "@playwright/test";

test("the main chart shows the first watchlist ticker and follows a row click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "true");

  const chart = page.getByTestId("main-chart");
  await expect(chart).toHaveAttribute("data-ticker", "AAPL");
  await expect(chart).toHaveAttribute("data-points", /^([2-9]|\d{2,})$/, { timeout: 10_000 });
  await expect(page.getByTestId("main-chart-title")).toHaveText("AAPL");

  await page.getByTestId("change-MSFT").click();
  await expect(chart).toHaveAttribute("data-ticker", "MSFT");
  await expect(page.getByTestId("main-chart-title")).toHaveText("MSFT");
  await expect(page.getByTestId("watchlist-row-MSFT")).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("watchlist-row-AAPL")).toHaveAttribute("data-selected", "false");
});
