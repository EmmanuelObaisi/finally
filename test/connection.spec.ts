import { test, expect } from "@playwright/test";

test("fresh start shows $10,000 and a live connection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("header-total-value")).toHaveText("$10,000.00");
  await expect(page.getByTestId("header-cash")).toHaveText("$10,000.00");
  await expect(page.getByTestId("connection-dot")).toHaveAttribute("data-status", "connected");
  await expect(page.getByTestId("connection-label")).toHaveText("Live");
});

test("a failing stream shows Offline and dims the header", async ({ page }) => {
  await page.route("**/api/stream/prices", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"Internal server error"}',
    }),
  );
  await page.goto("/");
  await expect(page.getByTestId("connection-dot")).toHaveAttribute("data-status", "disconnected", {
    timeout: 5000,
  });
  await expect(page.getByTestId("connection-label")).toHaveText("Offline");
  await expect(page.getByTestId("header-total-value")).toHaveText("$10,000.00");
  await expect(page.getByTestId("header-total-value")).toHaveClass(/opacity-60/);
});
