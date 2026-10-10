import { test, expect, type Page } from "@playwright/test";

const num = (text: string) => Number(text.replace(/[$,]/g, ""));

/** Fill the trade bar, click buy or sell, expect success and return the trade message. */
async function trade(page: Page, side: "buy" | "sell", ticker: string, quantity: number) {
  await page.getByTestId("trade-ticker").fill(ticker);
  await page.getByTestId("trade-quantity").fill(String(quantity));
  await page.getByTestId(side === "buy" ? "trade-buy" : "trade-sell").click();
  const message = page.getByTestId("trade-message");
  await expect(message).toHaveAttribute("data-kind", "success");
  return message.innerText();
}

test("selling raises cash by the fill and reduces then removes the position", async ({ page }) => {
  const { positions } = await (await page.request.get("/api/portfolio")).json();
  const q0: number = positions.find((p: { ticker: string }) => p.ticker === "MSFT")?.quantity ?? 0;

  await page.goto("/");
  const cash = page.getByTestId("header-cash");
  await expect(cash).toHaveText(/^\$[\d,]+\.\d{2}$/);
  await trade(page, "buy", "MSFT", 3);
  await expect(page.getByTestId("position-qty-MSFT")).toHaveText(String(q0 + 3));

  const c0 = num(await cash.innerText());
  const first = await trade(page, "sell", "MSFT", 1);
  const price1 = num(first.match(/^Sold 1 MSFT at (\$[\d,]+\.\d{2})$/)![1]);
  await expect.poll(async () => num(await cash.innerText())).toBeCloseTo(c0 + price1, 2);
  await expect(page.getByTestId("position-qty-MSFT")).toHaveText(String(q0 + 2));

  const c1 = num(await cash.innerText());
  const rest = await trade(page, "sell", "MSFT", q0 + 2);
  const price2 = num(rest.match(new RegExp(`^Sold ${q0 + 2} MSFT at (\\$[\\d,]+\\.\\d{2})$`))![1]);
  const proceeds = Math.round((q0 + 2) * price2 * 100) / 100;
  await expect.poll(async () => num(await cash.innerText())).toBeCloseTo(c1 + proceeds, 2);
  await expect(page.getByTestId("position-row-MSFT")).toHaveCount(0);
});
