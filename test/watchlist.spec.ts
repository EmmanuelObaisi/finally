import { test, expect } from "@playwright/test";

const MONEY = /^\$[\d,]+\.\d{2}$/;

test("adding a ticker from the panel streams it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId(/^watchlist-row-/).first()).toBeVisible();

  const input = page.getByTestId("watchlist-add-input");
  await input.fill("pypl");
  await input.press("Enter");

  await expect(page.getByTestId("watchlist-row-PYPL")).toBeVisible();
  await expect(page.getByTestId("price-PYPL")).toHaveText(MONEY);
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("watchlist-message")).toHaveAttribute("data-kind", "idle");

  await page.getByTestId("watchlist-remove-PYPL").click();
  await expect(page.getByTestId("watchlist-row-PYPL")).toHaveCount(0);
});

test("removing a held ticker keeps its position streaming", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("header-cash")).toHaveText(MONEY);

  await page.getByTestId("trade-ticker").fill("NFLX");
  await page.getByTestId("trade-quantity").fill("1");
  await page.getByTestId("trade-buy").click();
  await expect(page.getByTestId("trade-message")).toHaveAttribute("data-kind", "success");
  await expect(page.getByTestId("position-row-NFLX")).toBeVisible();

  await page.getByTestId("watchlist-remove-NFLX").click();
  await expect(page.getByTestId("watchlist-row-NFLX")).toHaveCount(0);
  await expect(page.getByTestId("position-row-NFLX")).toBeVisible();

  const price = page.getByTestId("position-price-NFLX");
  await expect(price).toHaveText(MONEY);
  const first = await price.innerText();
  await expect(price).not.toHaveText(first, { timeout: 10_000 });
});

test("a malformed ticker is rejected inline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId(/^watchlist-row-/).first()).toBeVisible();

  const input = page.getByTestId("watchlist-add-input");
  await input.fill("PYPL$");
  await page.getByTestId("watchlist-add-button").click();

  const message = page.getByTestId("watchlist-message");
  await expect(message).toHaveAttribute("data-kind", "error");
  await expect(message).toHaveText("Invalid ticker: PYPL$");
  await expect(input).toHaveValue("PYPL$");
});
