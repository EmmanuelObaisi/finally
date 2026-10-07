import { test, expect } from "@playwright/test";

test("placeholder page loads and reaches the API", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-title")).toHaveText("FinAlly");
  await expect(page.getByTestId("api-status")).toHaveText("ok");
});
