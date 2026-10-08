---
status: testing
phase: 02-live-market-terminal
source: [02-VERIFICATION.md]
started: 2026-10-08T00:00:00Z
updated: 2026-10-08T00:00:00Z
---

## Current Test

number: 1
name: Run with a real MASSIVE_API_KEY (paid and, if available, free plan) and open the UI
expected: |
  Same 10 rows stream with no frontend change; startup does not fail on this Windows + Avast machine (certifi vs OS trust store)
awaiting: user response

## Tests

### 1. Run with a real MASSIVE_API_KEY (paid and, if available, free plan) and open the UI
expected: Same 10 rows stream with no frontend change; startup does not fail on this Windows + Avast machine (certifi vs OS trust store)
result: [pending]

### 2. With the page open in a real browser, kill the backend, wait more than 5 s, restart it with the same DB_PATH
expected: Dot goes yellow, then red after 5 s, header dims; after restart the dot returns to green on its own, prices resume, header total refetches
result: [pending]

### 3. Watch the terminal for 30 s at 1280x720 and 1920x1080
expected: Flashes fade smoothly over ~500 ms, sparklines grow, layout feels dense and readable
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
