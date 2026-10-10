import { test, expect, type Page } from "@playwright/test";

const num = (text: string) => Number(text.replace(/[$,]/g, ""));

async function aaplQuantity(page: Page): Promise<number> {
  const { positions } = await (await page.request.get("/api/portfolio")).json();
  return positions.find((p: { ticker: string }) => p.ticker === "AAPL")?.quantity ?? 0;
}

async function send(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

test("the AI copilot trades from chat and the conversation survives a reload", async ({ page }) => {
  const q0 = await aaplQuantity(page);

  await page.goto("/");
  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
  const cash = page.getByTestId("header-cash");
  await expect(cash).toHaveText(/^\$[\d,]+\.\d{2}$/);
  const c0 = num(await cash.innerText());

  await send(page, "please buy some apple");
  const action = page.getByTestId("chat-action").last();
  await expect(action).toHaveAttribute("data-ok", "true");
  await expect(action).toContainText("Done");
  const bought = (await action.innerText()).match(/Bought 1 AAPL at (\$[\d,]+\.\d{2})/);
  expect(bought).not.toBeNull();
  await expect(page.getByTestId("chat-message-assistant").last()).toContainText("Buying 1 AAPL now.");
  await expect.poll(async () => num(await cash.innerText())).toBeCloseTo(c0 - num(bought![1]), 2);
  await expect(page.getByTestId("position-row-AAPL")).toBeVisible();

  const c1 = await cash.innerText();
  await send(page, "broke");
  await expect(action).toHaveAttribute("data-ok", "false");
  await expect(action).toContainText("Insufficient cash");
  await expect(cash).toHaveText(c1);

  await page.reload();
  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-messages")).toContainText("please buy some apple");
  await expect(page.getByTestId("chat-action").filter({ hasText: "Bought 1 AAPL at" })).toHaveCount(1);

  await send(page, "now sell it");
  await expect(page.getByTestId("chat-action").last()).toContainText("Sold 1 AAPL at");
  await expect(page.getByTestId("chat-action").last()).toHaveAttribute("data-ok", "true");
  await expect.poll(() => aaplQuantity(page)).toBe(q0);
});
