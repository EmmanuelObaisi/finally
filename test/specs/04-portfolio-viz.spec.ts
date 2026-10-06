import { expect, test } from '@playwright/test';
import { openApp, tradeViaUi } from './helpers';

test.describe('portfolio visualizations', () => {
  test('heatmap shows a held position and the P&L chart has snapshots', async ({ page }) => {
    await openApp(page);

    await tradeViaUi(page, 'JPM', 1, 'buy');
    await expect(page.getByTestId('position-row-JPM')).toBeVisible();

    const cell = page.getByTestId('heatmap').getByTestId('heatmap-cell-JPM');
    await expect(cell).toBeVisible();
    await expect(cell).toHaveAttribute('data-pnl', /^(up|down)$/);

    const pnlChart = page.getByTestId('pnl-chart');
    await expect(pnlChart.locator('canvas').first()).toBeVisible();
    await expect.poll(async () => Number(await pnlChart.getAttribute('data-points'))).toBeGreaterThan(0);
  });
});
