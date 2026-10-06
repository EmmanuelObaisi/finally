import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('watchlist', () => {
  test('adds and removes a ticker', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('watchlist-add-input').fill('IBM');
    await page.getByTestId('watchlist-add-button').click();
    await expect(page.getByTestId('watchlist-row-IBM')).toBeVisible();
    await expect(page.getByTestId('watchlist-price-IBM')).toHaveText(/\d+\.\d+/);

    await page.getByTestId('watchlist-remove-IBM').click();
    await expect(page.getByTestId('watchlist-row-IBM')).toHaveCount(0);
  });

  test('keeps a removal after reload', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('watchlist-remove-NFLX').click();
    await expect(page.getByTestId('watchlist-row-NFLX')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('watchlist-row-AAPL')).toBeVisible();
    await expect(page.getByTestId('watchlist-row-NFLX')).toHaveCount(0);

    await page.getByTestId('watchlist-add-input').fill('NFLX');
    await page.getByTestId('watchlist-add-button').click();
    await expect(page.getByTestId('watchlist-row-NFLX')).toBeVisible();
  });
});
