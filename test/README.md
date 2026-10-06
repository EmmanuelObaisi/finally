# FinAlly E2E tests

Playwright tests that run on the host against a running app.

```bash
npm install
npx playwright install chromium     # set NODE_USE_SYSTEM_CA=1 on TLS-intercepted machines
npx playwright test                 # BASE_URL defaults to http://localhost:8000
```

The app must be started with `LLM_MOCK=true` and a fresh database (the fresh-start spec
expects $10,000 cash). Specs share that database and run serially in file-name order.
