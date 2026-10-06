import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('AI chat (LLM_MOCK=true)', () => {
  test('a buy request returns a reply and executes the trade inline', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('chat-input').fill('Please buy some Apple');
    await page.getByTestId('chat-send').click();

    await expect(page.locator('[data-testid="chat-message"][data-role="user"]').last()).toContainText('Please buy some Apple');
    await expect(page.locator('[data-testid="chat-message"][data-role="assistant"]').last()).toContainText('Mock: buying 1 AAPL.');
    const action = page.getByTestId('chat-action').last();
    await expect(action).toContainText('AAPL');
    await expect(action).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('chat-loading')).not.toBeVisible();
    await expect(page.getByTestId('position-row-AAPL')).toBeVisible();
  });

  test('an add request puts the ticker on the watchlist', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('chat-input').fill('add PayPal please');
    await page.getByTestId('chat-send').click();

    await expect(page.locator('[data-testid="chat-message"][data-role="assistant"]').last()).toContainText('Mock: adding PYPL to your watchlist.');
    const action = page.getByTestId('chat-action').last();
    await expect(action).toContainText('PYPL');
    await expect(action).toHaveAttribute('data-status', 'ok');
    await expect(page.getByTestId('watchlist-row-PYPL')).toBeVisible();
  });
});
