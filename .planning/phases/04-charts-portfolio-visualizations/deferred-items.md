# Deferred items (Phase 4)

## Intermittent WatchlistPanel selection test failures (found in plan 04-04, out of scope)

`frontend/src/components/WatchlistPanel.test.tsx` "WatchlistPanel selection" tests occasionally fail on a full or repeated run (seen: "selects the first ticker once the list loads and marks only its row", and "selects nothing for an empty list" with `expected 'loading' to be 'ready'`). Observed 2 failures in 7 runs; passing on re-run with no code change in between. Likely cause: the test awaits a DOM element with `findByTestId` and then reads the selection store, but the store is synced from a later effect, so the assertion can run before the sync. Neither WatchlistPanel nor the selection store was touched by plan 04-04.
