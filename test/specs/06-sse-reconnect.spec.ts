import { expect, test } from '@playwright/test';

test.describe('SSE resilience', () => {
  test('recovers when the price stream comes back', async ({ page }) => {
    // Playwright's offline mode does not drop an open EventSource, so the stream
    // is blocked at the network layer instead; EventSource keeps retrying.
    let streamBlocked = true;
    await page.route('**/api/stream/prices', (route) =>
      streamBlocked ? route.abort('internetdisconnected') : route.continue(),
    );

    await page.goto('/');
    const status = page.getByTestId('connection-status');
    await expect(status).toHaveAttribute('data-status', /reconnecting|disconnected/);

    streamBlocked = false;
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: 20_000 });

    const price = page.getByTestId('watchlist-price-AAPL');
    await expect(price).toHaveText(/\d+\.\d+/);
    const first = await price.innerText();
    await expect(price).not.toHaveText(first);
  });
});
