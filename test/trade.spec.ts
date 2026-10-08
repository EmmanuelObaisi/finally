import { test, expect } from "@playwright/test";

const MONEY = /^\$[\d,]+\.\d{2}$/;

test("buying from the trade bar fills the order", async ({ page }) => {
  await page.goto("/");
  const cash = page.getByTestId("header-cash");
  await expect(cash).toHaveText(MONEY);
  const before = await cash.innerText();

  await page.getByTestId("trade-ticker").fill("AAPL");
  await page.getByTestId("trade-quantity").fill("2");
  await page.getByTestId("trade-buy").click();

  const message = page.getByTestId("trade-message");
  await expect(message).toHaveAttribute("data-kind", "success");
  await expect(message).toHaveText(/^Bought 2 AAPL at \$[\d,]+\.\d{2}$/);
  await expect(cash).not.toHaveText(before);

  await expect(page.getByTestId("position-row-AAPL")).toBeVisible();
  await expect(page.getByTestId("position-qty-AAPL")).toHaveText("2");
  await expect(page.getByTestId("position-price-AAPL")).toHaveText(MONEY);

  await page.getByTestId("trade-quantity").fill("2");
  await page.getByTestId("trade-sell").click();
  await expect(message).toHaveText(/^Sold 2 AAPL at \$[\d,]+\.\d{2}$/);
  await expect(page.getByTestId("position-row-AAPL")).toHaveCount(0);
});

test("buying an unwatched ticker adds a streaming position row", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("header-cash")).toHaveText(MONEY);

  await page.getByTestId("trade-ticker").fill("IBM");
  await page.getByTestId("trade-quantity").fill("1");
  await page.getByTestId("trade-buy").click();

  await expect(page.getByTestId("position-row-IBM")).toBeVisible();
  const price = page.getByTestId("position-price-IBM");
  await expect(price).toHaveText(MONEY);
  const first = await price.innerText();
  await expect(price).not.toHaveText(first, { timeout: 10_000 });
  await expect(page.getByTestId("watchlist-row-IBM")).toHaveCount(0);
});

test("a rejected oversell shows the reason inline and leaves cash unchanged", async ({ page }) => {
  await page.goto("/");
  const cash = page.getByTestId("header-cash");
  await expect(cash).toHaveText(MONEY);
  const before = await cash.innerText();

  await page.getByTestId("trade-ticker").fill("AAPL");
  await page.getByTestId("trade-quantity").fill("1000");
  await page.getByTestId("trade-sell").click();

  const message = page.getByTestId("trade-message");
  await expect(message).toHaveAttribute("data-kind", "error");
  await expect(message).toHaveText(/^Insufficient shares: you hold [\d.]+ AAPL$/);
  await expect(cash).toHaveText(before);
});
