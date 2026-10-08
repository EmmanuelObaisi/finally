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
