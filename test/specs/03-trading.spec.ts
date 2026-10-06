import { expect, test } from '@playwright/test';
import { heldQuantity, openApp, readNumber, tradeViaUi } from './helpers';

test.describe('trading', () => {
  test('buying shares lowers cash and adds a position', async ({ page, request }) => {
    await openApp(page);
    const cash = page.getByTestId('cash-balance');
    const cashBefore = await readNumber(cash);

    await tradeViaUi(page, 'NVDA', 2, 'buy');

    await expect(page.getByTestId('positions-table').getByTestId('position-row-NVDA')).toBeVisible();
    await expect.poll(() => readNumber(cash)).toBeLessThan(cashBefore);
    expect(await heldQuantity(request, 'NVDA')).toBe(2);
  });

  test('selling shares raises cash and removes a closed position', async ({ page, request }) => {
    await openApp(page);
    const cash = page.getByTestId('cash-balance');
    const row = page.getByTestId('position-row-MSFT');

    await tradeViaUi(page, 'MSFT', 3, 'buy');
    await expect(row).toBeVisible();

    const cashBeforeSell = await readNumber(cash);
    await tradeViaUi(page, 'MSFT', 1, 'sell');
    await expect.poll(() => readNumber(cash)).toBeGreaterThan(cashBeforeSell);
    await expect.poll(() => heldQuantity(request, 'MSFT')).toBe(2);
    await expect(row).toBeVisible();

    await tradeViaUi(page, 'MSFT', 2, 'sell');
    await expect(row).toHaveCount(0);
    expect(await heldQuantity(request, 'MSFT')).toBe(0);
  });

  test('rejected trade shows an error and changes nothing', async ({ page }) => {
    await openApp(page);
    const cashBefore = await readNumber(page.getByTestId('cash-balance'));

    await tradeViaUi(page, 'TSLA', 1000000, 'buy');

    await expect(page.getByTestId('trade-error')).toBeVisible();
    await expect(page.getByTestId('position-row-TSLA')).toHaveCount(0);
    expect(await readNumber(page.getByTestId('cash-balance'))).toBe(cashBefore);
  });
});
