import { test, expect } from "@playwright/test";

test("fresh start shows $10,000 and a live connection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("header-total-value")).toHaveText("$10,000.00");
  await expect(page.getByTestId("header-cash")).toHaveText("$10,000.00");
  await expect(page.getByTestId("connection-dot")).toHaveAttribute("data-status", "connected");
  await expect(page.getByTestId("connection-label")).toHaveText("Live");
});
