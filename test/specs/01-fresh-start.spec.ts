import { expect, test } from '@playwright/test';
import { DEFAULT_TICKERS, openApp, readNumber } from './helpers';

test.describe('fresh start', () => {
  test('shows the default watchlist and $10,000 cash', async ({ page }) => {
    await openApp(page);

    await expect(page.locator('[data-testid^="watchlist-row-"]')).toHaveCount(DEFAULT_TICKERS.length);
    for (const ticker of DEFAULT_TICKERS) {
      await expect(page.getByTestId(`watchlist-row-${ticker}`)).toBeVisible();
    }
    expect(await readNumber(page.getByTestId('cash-balance'))).toBe(10000);
    expect(await readNumber(page.getByTestId('total-value'))).toBe(10000);
  });

  test('streams live prices into the watchlist', async ({ page }) => {
    await openApp(page);

    const price = page.getByTestId('watchlist-price-AAPL');
    await expect(price).toHaveText(/\d+\.\d+/);
    const first = await price.innerText();
    await expect(price).not.toHaveText(first);
  });

  test('shows the main chart for a clicked ticker', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('watchlist-row-MSFT').click();
    const chart = page.getByTestId('main-chart');
    await expect(chart).toHaveAttribute('data-ticker', 'MSFT');
    await expect(chart.locator('canvas').first()).toBeVisible();
  });
});
