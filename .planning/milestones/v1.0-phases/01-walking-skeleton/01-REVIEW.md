---
phase: 01-walking-skeleton
reviewed: 2026-10-08T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - Dockerfile
  - backend/app/config.py
  - backend/app/main.py
  - backend/tests/conftest.py
  - backend/tests/test_config.py
  - backend/tests/test_errors.py
  - backend/tests/test_health.py
  - frontend/src/lib/api.ts
  - test/health-status.spec.ts
findings:
  critical: 0
  warning: 1
  info: 6
  total: 7
status: issues_found
---

# Phase 1: Code Review Report (gap-closure re-review)

**Reviewed:** 2026-10-08
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This re-review covers the files touched by gap-closure plans 01-06, 01-07 and 01-08, plus the supporting files needed to verify them (`backend/app/errors.py`, `.env.example`, `.gitignore`, `frontend/src/app/page.tsx`, `test/playwright.config.ts`). I also ran the backend suite (`uv run --extra dev python -m pytest`: 30 passed) and probed the app in-process with `TestClient`.

All six prior fixes are sound:

| Prior ID | Verdict | Evidence |
|----------|---------|----------|
| CR-01 | Fixed | `config.env()` strips and treats blank as unset, and every setting goes through it. `test_blank_values_fall_back_to_defaults` (empty and whitespace) and `test_committed_env_example_loads_as_defaults` cover the exact trigger. |
| WR-01 | Fixed | `set -e` is the first statement of the `uv sync` RUN, so a failing `uv sync` fails the build. The `rm -f` is now harmless. |
| WR-02 | Fixed | The final stage creates a system user `app`, chowns `/app/db`, and sets `USER app`. `DB_PATH` is set explicitly, which matters because `ROOT_DIR` resolves to `/` in the container. The healthcheck uses `urlopen`, which raises on non-2xx, and does not need root. |
| WR-03 | Fixed | The autouse `isolated_env` fixture repoints `ROOT_DIR` and clears config vars. I traced the monkeypatch undo order: the `setenv` then `delenv` pair restores the original state, so values written by `load_dotenv` do not leak. The `settings` fixture removes the dependency on a real `.env`. |
| WR-04 | Fixed | `getHealth` throws on `!res.ok`, the page's `.catch` sets "down", and `health-status.spec.ts` covers 404, 500 and 503. |
| WR-05 | Fixed | `add_route` with a `JSONResponse` instance has no method filter. Probed: all nine methods in `test_any_method_on_unknown_api_path_is_json_404` return JSON 404, with and without the static mount. |

No critical issues were found. One warning is new (the catch-all converts wrong-method requests on known paths into 404). The prior Info findings IN-01..IN-03 still apply and are carried forward below. Three new minor items are added.

## Warnings

### WR-01: The `/api/*` catch-all turns wrong-method requests on real endpoints into 404 instead of 405

**File:** `backend/app/main.py:24-31`
**Issue:** Starlette's router returns the first FULL match. The catch-all `/api/{path:path}` fully matches every method, so it beats the PARTIAL match from a real route whose method differs. Probed: `POST /api/health` returns `404 {"error": "Not found"}`, not 405 `Method Not Allowed`. The contract only requires 404 for unknown paths. Once Phase 2+ adds routes such as `GET /api/portfolio` and `POST /api/portfolio/trade`, a client or test that uses the wrong verb on a real endpoint (for example `GET /api/portfolio/trade`) will be told the endpoint does not exist. That is misleading and hard to debug. The 405 branch of the `StarletteHTTPException` handler in `errors.py` also becomes unreachable for `/api` routes.
**Fix:** Restrict the catch-all to paths no real route matches. The simplest option is to keep the catch-all but register it with a custom route class that returns 405 on a partial match. Or decide explicitly that 404 for everything is intended and add one sentence to `API_CONTRACT.md` ("a wrong method on a known path is also 404") plus a test that pins it. Either way the behavior should be a decision, not an accident.

## Info

### IN-01: Validation-error message formatting is inconsistent for non-field locations (carried forward)

**File:** `backend/app/errors.py:17-19`
**Issue:** Unchanged since the prior review. The filter `p != "body"` drops any path element named "body", including a real field of that name. A missing body gives `loc == ("body",)`, so the message is `": Field required"`. A JSON decode error gives `"0: JSON decode error"`.
**Fix:**
```python
parts = first["loc"][1:] if first["loc"][:1] == ("body",) else first["loc"]
loc = ".".join(map(str, parts))
msg = f"{loc}: {first['msg']}" if loc else first["msg"]
```

### IN-02: `test_health_is_side_effect_free` asserts nothing about side effects (carried forward)

**File:** `backend/tests/test_health.py:12-17`
**Issue:** Unchanged. It only checks that two calls return identical bodies, which `test_health_ok` already covers. It never checks that no state (such as a DB file) was created.
**Fix:** Assert `not settings.db_path.exists()` after the two calls, or delete the test.

### IN-03: `.gitignore` gaps (carried forward)

**File:** `.gitignore` (the `db/*.db-*` and `out/` entries near the end)
**Issue:** Unchanged. `db/*.db-journal` is not ignored (only `-wal` and `-shm`). The bare `out/` and `env/` patterns match directories of those names anywhere in the tree, not just `frontend/out`.
**Fix:** Add `db/*.db-journal`. Anchor the patterns as `/frontend/out/` and `/env/`.

### IN-04: `CONFIG_VARS` is defined twice

**File:** `backend/tests/test_config.py:22-23` and `backend/tests/conftest.py:7-8`
**Issue:** The identical tuple is duplicated. If a setting is added to one and not the other, the autouse fixture and the blank-value test drift apart silently, and the blank test would skip the new variable. `test_defaults` also takes an unused `monkeypatch` parameter.
**Fix:** Import it: `from .conftest import CONFIG_VARS`, or expose it as a fixture. Drop the unused parameter.

### IN-05: Non-root image will not be able to write a root-owned `/app/db` mount

**File:** `Dockerfile:33-36`
**Issue:** `chown app:app /app/db` helps only when Docker initializes a new named volume from the image directory. A host bind mount (for example `./db:/app/db` in the planned `docker-compose.yml`) or a `finally-data` volume created by an earlier root-user image will be owned by another uid. Once the DB is created in Phase 2, SQLite fails there with "unable to open database file". There is no compose file yet, so this is forward-looking.
**Fix:** In the compose file and the start scripts, use the named volume (as PLAN.md section 11 does), and document the recovery step (`docker volume rm finally-data`) in the README. Alternatively pin the uid, for example `useradd --uid 1000`, so a bind mount can be chowned predictably.

### IN-06: Minor robustness and consistency nits in the health path

**File:** `frontend/src/lib/api.ts:7`, `backend/app/main.py:31-34`
**Issue:** Two small points.
1. `(await res.json()) as Health` trusts the shape. A `200` with a JSON body lacking `status` still reaches `setApi(undefined)` and renders an empty span, which is the residual tail of the original WR-04. The backend never produces this, so it only matters behind a misconfigured proxy. Given the project's "no defensive programming" rule, this is acceptable, but a one-line `h.status ?? "down"` in `page.tsx` would close it.
2. The bare path `/api` is not matched by `/api/{path:path}`. With the static mount it falls through to `StaticFiles` and returns `{"error": "Not Found"}` (capital F), against `{"error": "Not found"}` for every other unknown API path. Both are JSON 404s, so this is cosmetic. The same capitalization difference applies to any unknown non-API path.
**Fix:** Optional. Use `h.status ?? "down"` in `page.tsx`. Optionally register the catch-all for `"/api"` as well.

---

_Reviewed: 2026-10-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
