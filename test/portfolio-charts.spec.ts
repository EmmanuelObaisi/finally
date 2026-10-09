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

test("keyboard Enter on a ticker selects it", async ({ page }) => {
  await page.goto("/");
  const chart = page.getByTestId("main-chart");
  await expect(chart).toHaveAttribute("data-ticker", "AAPL", { timeout: 10_000 });

  await page.getByTestId("select-GOOGL").focus();
  await page.keyboard.press("Enter");
  await expect(chart).toHaveAttribute("data-ticker", "GOOGL");
  await expect(page.getByTestId("select-GOOGL")).toHaveAttribute("aria-current", "true");
});

test("a trade adds points to the portfolio value chart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("header-cash")).toHaveText(/^\$[\d,]+\.\d{2}$/);

  // Fresh run: only the seeded snapshot exists, so the chart shows its never-traded empty state.
  await expect(page.getByTestId("pnl-empty")).toBeVisible();
  await expect(page.getByTestId("pnl-value")).toHaveText("$10,000.00");
  await expect(page.getByTestId("pnl-delta")).toHaveText("0.00 (0.00%)");

  await page.getByTestId("trade-ticker").fill("AAPL");
  await page.getByTestId("trade-quantity").fill("1");
  await page.getByTestId("trade-buy").click();
  const message = page.getByTestId("trade-message");
  await expect(message).toHaveAttribute("data-kind", "success");

  // The live point appears only once a second has passed after the trade snapshot.
  await expect(page.getByTestId("pnl-chart")).toHaveAttribute("data-points", /^([3-9]|\d{2,})$/, {
    timeout: 10_000,
  });

  await page.getByTestId("trade-quantity").fill("1");
  await page.getByTestId("trade-sell").click();
  await expect(message).toHaveAttribute("data-kind", "success");
  await expect(page.getByTestId("position-row-AAPL")).toHaveCount(0);

  // Closing every position keeps the chart: history now holds more than the seed point.
  await expect(page.getByTestId("positions-empty")).toBeVisible();
  await expect(page.getByTestId("pnl-chart")).toBeVisible();
  await expect(page.getByTestId("pnl-empty")).toHaveCount(0);
});
