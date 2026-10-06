import { expect, test } from '@playwright/test';

const PORTFOLIO_KEYS = ['cash_balance', 'total_value', 'positions_value', 'unrealized_pnl', 'positions'];
const POSITION_KEYS = ['ticker', 'quantity', 'avg_cost', 'current_price', 'market_value', 'unrealized_pnl', 'pnl_percent'];
const WATCH_ITEM_KEYS = ['ticker', 'price', 'previous_price', 'change', 'direction', 'day_change_percent'];

test.describe('REST API contract', () => {
  test('health', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('portfolio shape', async ({ request }) => {
    const portfolio = await (await request.get('/api/portfolio')).json();
    for (const key of PORTFOLIO_KEYS) expect(portfolio).toHaveProperty(key);
    for (const position of portfolio.positions) {
      for (const key of POSITION_KEYS) expect(position).toHaveProperty(key);
    }
  });

  test('watchlist shape, add, duplicate add, remove, unknown remove', async ({ request }) => {
    const list = await (await request.get('/api/watchlist')).json();
    expect(list.length).toBeGreaterThan(0);
    for (const key of WATCH_ITEM_KEYS) expect(list[0]).toHaveProperty(key);

    const added = await request.post('/api/watchlist', { data: { ticker: 'ko' } });
    expect(added.status()).toBe(200);
    const afterAdd = await added.json();
    expect(afterAdd.map((item: { ticker: string }) => item.ticker)).toContain('KO');

    const duplicate = await request.post('/api/watchlist', { data: { ticker: 'KO' } });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json()).length).toBe(afterAdd.length);

    const removed = await request.delete('/api/watchlist/KO');
    expect(removed.status()).toBe(200);
    expect((await removed.json()).map((item: { ticker: string }) => item.ticker)).not.toContain('KO');

    const missing = await request.delete('/api/watchlist/KO');
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toHaveProperty('detail');
  });

  test('watchlist rejects a malformed ticker', async ({ request }) => {
    const response = await request.post('/api/watchlist', { data: { ticker: '123' } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toHaveProperty('detail');
  });

  test('trade success returns trade and portfolio', async ({ request }) => {
    const response = await request.post('/api/portfolio/trade', { data: { ticker: 'amzn', quantity: 0.5, side: 'buy' } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.trade).toMatchObject({ ticker: 'AMZN', side: 'buy', quantity: 0.5 });
    expect(body.trade).toHaveProperty('price');
    expect(body.trade).toHaveProperty('executed_at');
    for (const key of PORTFOLIO_KEYS) expect(body.portfolio).toHaveProperty(key);
  });

  test('held tickers keep a price off the watchlist', async ({ request }) => {
    const bought = await request.post('/api/portfolio/trade', { data: { ticker: 'ORCL', quantity: 1, side: 'buy' } });
    expect(bought.status()).toBe(200);
    const watchlist = await (await request.get('/api/watchlist')).json();
    expect(watchlist.map((item: { ticker: string }) => item.ticker)).not.toContain('ORCL');

    await request.post('/api/watchlist', { data: { ticker: 'ORCL' } });
    expect((await request.delete('/api/watchlist/ORCL')).status()).toBe(200);

    const portfolio = await (await request.get('/api/portfolio')).json();
    const position = portfolio.positions.find((p: { ticker: string }) => p.ticker === 'ORCL');
    expect(position.current_price).toEqual(expect.any(Number));
  });

  test('trade validation errors return 400', async ({ request }) => {
    const cases = [
      { ticker: 'AAPL', quantity: 0, side: 'buy' },
      { ticker: 'AAPL', quantity: 1e9, side: 'buy' },
      { ticker: 'GOOGL', quantity: 1e6, side: 'sell' },
    ];
    for (const data of cases) {
      const response = await request.post('/api/portfolio/trade', { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
      expect(await response.json()).toHaveProperty('detail');
    }
  });

  test('portfolio history shape', async ({ request }) => {
    const history = await (await request.get('/api/portfolio/history')).json();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty('total_value');
    expect(history[0]).toHaveProperty('recorded_at');
  });

  test('mock chat buy returns ChatResponse with an ok trade', async ({ request }) => {
    const response = await request.post('/api/chat', { data: { message: 'buy' } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.message).toBe('Mock: buying 1 AAPL.');
    expect(body.actions.trades[0]).toMatchObject({ ticker: 'AAPL', side: 'buy', quantity: 1, status: 'ok' });
    expect(body.actions.watchlist_changes).toEqual([]);
    for (const key of PORTFOLIO_KEYS) expect(body.portfolio).toHaveProperty(key);
  });

  test('price stream sends one dict of all tracked tickers per event', async ({ page }) => {
    await page.goto('/api/health');
    const payload = await page.evaluate(
      () =>
        new Promise<Record<string, Record<string, unknown>>>((resolve) => {
          const source = new EventSource('/api/stream/prices');
          source.onmessage = (event) => {
            source.close();
            resolve(JSON.parse(event.data));
          };
        }),
    );
    expect(Object.keys(payload)).toContain('AAPL');
    expect(Object.keys(payload.AAPL).sort()).toEqual(
      ['change', 'day_change_percent', 'direction', 'previous_price', 'price', 'ticker', 'timestamp'],
    );
  });

  test('mock chat fallback has no actions', async ({ request }) => {
    const body = await (await request.post('/api/chat', { data: { message: 'hello' } })).json();
    expect(body.message).toBe('Mock: I am FinAlly, your AI trading assistant.');
    expect(body.actions).toEqual({ trades: [], watchlist_changes: [] });
  });
});
