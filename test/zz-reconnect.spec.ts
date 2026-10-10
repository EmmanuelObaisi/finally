import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

const run = promisify(execFile);
const MONEY = /^\$[\d,]+\.\d{2}$/;

test.skip(!process.env.E2E_CONTAINER, "container mode only: needs the throwaway test container");

// Sorts last (zz-) because the restart drops every connection and resets the simulator.
test("the stream reconnects after a server restart without a reload and the data survives", async ({
  page,
}) => {
  test.setTimeout(90_000);

  // Flatten first: the simulator restarts from seed prices, so total equals cash only with no position.
  const held = (await (await page.request.get("/api/portfolio")).json()).positions as {
    ticker: string;
    quantity: number;
  }[];
  for (const { ticker, quantity } of held) {
    const sold = await page.request.post("/api/portfolio/trade", { data: { ticker, quantity, side: "sell" } });
    expect(sold.status()).toBe(200);
  }
  const flatCash = (await (await page.request.get("/api/portfolio")).json()).cash as number;

  await page.goto("/");
  const dot = page.getByTestId("connection-dot");
  const cash = page.getByTestId("header-cash");
  const total = page.getByTestId("header-total-value");
  await expect(dot).toHaveAttribute("data-status", "connected");
  await expect(cash).toHaveText(MONEY);
  const cashText = await cash.innerText();
  await expect(total).toHaveText(cashText);

  await page.evaluate(() => {
    const w = window as unknown as { __marker: number; __hist: string[] };
    w.__marker = 1;
    w.__hist = [];
    const el = document.querySelector('[data-testid="connection-dot"]')!;
    new MutationObserver(() => w.__hist.push(el.getAttribute("data-status")!)).observe(el, {
      attributes: true,
      attributeFilter: ["data-status"],
    });
  });

  const refetch = page.waitForRequest(
    (request) => request.method() === "GET" && new URL(request.url()).pathname === "/api/portfolio",
    { timeout: 30_000 },
  );
  await run("docker", ["restart", process.env.E2E_CONTAINER!]);

  await expect(dot).toHaveAttribute("data-status", "connected", { timeout: 30_000 });
  await refetch;
  const history = await page.evaluate(() => (window as unknown as { __hist: string[] }).__hist);
  expect(history.some((status) => status !== "connected")).toBe(true);
  expect(history.at(-1)).toBe("connected");
  expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(1);

  const price = page.getByTestId("price-AAPL");
  const before = await price.innerText();
  await expect(price).not.toHaveText(before, { timeout: 10_000 });

  await expect(cash).toHaveText(cashText);
  await expect(total).toHaveText(cashText);
  const after = (await (await page.request.get("/api/portfolio")).json()).cash as number;
  expect(after).toBe(flatCash);
});
