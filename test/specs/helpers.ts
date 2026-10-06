import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export const DEFAULT_TICKERS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'NFLX'];

/** Parse a displayed money or number string such as "$10,000.00" into a number. */
export function parseNumber(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ''));
}

/** Read a numeric value from an element's text. */
export async function readNumber(locator: Locator): Promise<number> {
  return parseNumber(await locator.innerText());
}

/** Open the app and wait until the price stream is connected. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected');
}

/** Submit a market order through the trade bar. */
export async function tradeViaUi(page: Page, ticker: string, quantity: number, side: 'buy' | 'sell'): Promise<void> {
  await page.getByTestId('trade-ticker').fill(ticker);
  await page.getByTestId('trade-quantity').fill(String(quantity));
  await page.getByTestId(`trade-${side}`).click();
}

/** Return the held quantity of a ticker from the REST API (0 if not held). */
export async function heldQuantity(request: APIRequestContext, ticker: string): Promise<number> {
  const portfolio = await (await request.get('/api/portfolio')).json();
  const position = portfolio.positions.find((p: { ticker: string }) => p.ticker === ticker);
  return position ? position.quantity : 0;
}
