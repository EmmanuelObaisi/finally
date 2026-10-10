---
status: testing
phase: 06-one-command-launch-full-verification
source: [06-VERIFICATION.md]
started: 2026-10-10T00:00:00Z
updated: 2026-10-10T00:00:00Z
---

## Current Test

number: 1
name: Real one-command launch on the default project and port (Windows)
expected: |
  At the repo root with nothing else on port 8000, `.\scripts\start_windows.ps1 -Build` builds, prints
  "FinAlly is running at http://localhost:8000" and opens the default browser on the live terminal
  (prices streaming, dot green). A second `.\scripts\start_windows.ps1` prints the same URL with no restart.
  Buy one share, run `.\scripts\stop_windows.ps1`; `docker volume ls` still lists `finally_finally-data`.
  After starting again, the bought position and cash are unchanged.
awaiting: user response

## Tests

### 1. Real one-command launch on the default project and port (Windows)
expected: First start builds, prints the URL and opens the browser on the live terminal; second start prints the same URL with no restart; after stop `finally_finally-data` is still listed; after the last start the position and cash are unchanged.
result: [pending]

### 2. (Optional) start_mac.sh / stop_mac.sh on real macOS or Linux
expected: Same behavior as the Windows pair, including `open` / `xdg-open` opening the browser.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
