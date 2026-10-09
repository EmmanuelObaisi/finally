---
status: testing
phase: 03-trading-watchlist-management
source: [03-VERIFICATION.md]
started: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

## Current Test

number: 1
name: Positions live cells dim while disconnected
expected: |
  With at least one position open, stopping the backend dims the Price, P&L and P&L % cells of every
  position row (opacity-60) while the connection dot is red, and they return to full brightness after reconnect.
awaiting: user response

## Tests

### 1. Positions live cells dim while disconnected
expected: The Price, P&L and P&L % cells of every position row dim (opacity-60) while the connection dot is red/disconnected, and return to full brightness after reconnect
result: [pending]

### 2. Layout fit at 1920x1080, 1280x800, 768x1024 and 480px
expected: The document does not scroll at desktop widths (only the watchlist and positions panels scroll internally), the trade bar and add-ticker form stay usable, and no horizontal overflow or clipped controls appear at 768 and 480
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
