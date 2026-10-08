---
phase: 02
review: 02-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Sparkline chart accumulates points beyond the 300-point store cap"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "\"sparklines draw from the stream\" E2E test passes with an empty chart"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "E2E backend is not isolated from the developer's shell environment and `.env`"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "A transient Massive error at startup aborts the whole app"
  - id: WR-05
    severity: warning
    disposition: skipped
    title: "Massive path has no OS-trust-store opt-in on the target machine"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "`change_percent` can raise ZeroDivisionError and kill the whole stream"
  - id: IN-01
    severity: info
    disposition: open
    title: "Overlapping fetches can apply a stale response (Header and WatchlistPanel)"
  - id: IN-02
    severity: info
    disposition: open
    title: "Header swallows portfolio errors silently"
  - id: IN-03
    severity: info
    disposition: open
    title: "Interface docs say `remove_ticker` evicts from the cache unconditionally"
  - id: IN-04
    severity: info
    disposition: open
    title: "Free-plan startup can exceed the stated 5 calls per minute"
  - id: IN-05
    severity: info
    disposition: open
    title: "Stale REST price shown for a ticker that has left the live frame"
  - id: IN-06
    severity: info
    disposition: open
    title: "Minor quality items"
  - id: IN-07
    severity: info
    disposition: open
    title: "Timing-based backend tests may be flaky under load"
open: 7
total: 13
recorded: 2026-10-08T14:44:39.862Z
---

# Phase 02: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 02-REVIEW-FIX.md |
| WR-02 | warning | fixed | 02-REVIEW-FIX.md |
| WR-03 | warning | fixed | 02-REVIEW-FIX.md |
| WR-04 | warning | fixed | 02-REVIEW-FIX.md |
| WR-05 | warning | skipped | 02-REVIEW-FIX.md |
| WR-06 | warning | fixed | 02-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
