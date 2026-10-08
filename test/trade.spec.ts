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
