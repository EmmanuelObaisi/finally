import { test, expect } from "@playwright/test";

for (const status of [404, 500, 503]) {
  test(`api status shows down when /api/health returns ${status}`, async ({ page }) => {
    await page.route("**/api/health", (route) =>
      route.fulfill({ status, json: { error: "Internal server error" } }),
    );
    await page.goto("/");
    await expect(page.getByTestId("api-status")).toHaveText("down");
  });
}
