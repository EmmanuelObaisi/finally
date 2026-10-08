import { test, expect } from "@playwright/test";

const SEED = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"];
const MONEY = /^\$[\d,]+\.\d{2}$/;

test("fresh start streams the seeded watchlist", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-title")).toHaveText("FinAlly");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(13, 17, 23)");

  const rows = page.locator('[data-testid^="watchlist-row-"]');
  await expect(rows).toHaveCount(10);
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(ids).toEqual(SEED.map((t) => "watchlist-row-" + t));

  const price = page.getByTestId("price-AAPL");
  await expect(price).toHaveText(MONEY);
  const first = await price.innerText();
  await expect(price).not.toHaveText(first, { timeout: 10_000 });
  await expect(page.getByTestId("change-AAPL")).toHaveText(/^([+-]\d+\.\d{2}|0\.00)%$/);
});

test("two pages stream at the same time", async ({ page, context }) => {
  const second = await context.newPage();
  await Promise.all([page.goto("/"), second.goto("/")]);
  for (const p of [page, second]) {
    await expect(p.locator('[data-testid^="watchlist-row-"]')).toHaveCount(10);
    await expect(p.getByTestId("price-AAPL")).toHaveText(MONEY);
  }
});
