---
phase: 01-walking-skeleton
review: 01-REVIEW.md
review_status: issues_found
findings:
  open: 9
  total: 9
updated: 2026-10-07
---

# Phase 1 — Code Review Disposition

One row per finding in `01-REVIEW.md`. Every finding defaults to `open` until it is fixed, deferred or rejected with a reason.

| ID | Severity | Finding | Disposition |
|----|----------|---------|-------------|
| CR-01 | critical | Copying `.env.example` to `.env` crashes the backend at startup (`SIM_EVENT_PROBABILITY=` -> `float("")`) | open |
| WR-01 | warning | Dockerfile masks a failed `uv sync` | open |
| WR-02 | warning | Runtime container runs as root | open |
| WR-03 | warning | Test suite depends on, and leaks, process environment | open |
| WR-04 | warning | `getHealth` ignores HTTP status and can render an empty status | open |
| WR-05 | warning | Non-GET/POST methods on unknown `/api/*` paths do not return the contract's 404 | open |
| IN-01 | info | Validation-error message formatting inconsistent for non-field locations | open |
| IN-02 | info | `test_health_is_side_effect_free` asserts nothing about side effects | open |
| IN-03 | info | `.gitignore` gaps | open |
