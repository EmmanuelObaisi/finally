---
phase: 01-walking-skeleton
reviewed: 2026-10-07T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - .dockerignore
  - .env.example
  - .gitattributes
  - .gitignore
  - Dockerfile
  - backend/.python-version
  - backend/app/__init__.py
  - backend/app/config.py
  - backend/app/errors.py
  - backend/app/main.py
  - backend/pyproject.toml
  - backend/tests/test_config.py
  - backend/tests/test_errors.py
  - backend/tests/test_health.py
  - frontend/next.config.ts
  - frontend/package.json
  - frontend/postcss.config.mjs
  - frontend/src/app/globals.css
  - frontend/src/app/layout.tsx
  - frontend/src/app/page.tsx
  - frontend/src/lib/api.ts
  - frontend/tsconfig.json
  - test/package.json
  - test/playwright.config.ts
  - test/smoke.spec.ts
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-07
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

The walking skeleton is small and mostly sound: the error envelope matches `planning/API_CONTRACT.md`, the `/api/*` catch-all keeps unknown API paths as JSON 404s, and the Docker stages are coherent. One real startup crash was found and reproduced. It is triggered by the project's own `.env.example`. Beyond that there are a swallowed build failure in the Dockerfile, test isolation leaks, and a few robustness gaps.

## Critical Issues

### CR-01: Copying `.env.example` to `.env` crashes the backend at startup

**File:** `backend/app/config.py:33` (trigger: `.env.example:6`)
**Issue:** `.env.example` ships `SIM_EVENT_PROBABILITY=` (empty). python-dotenv, and Docker `--env-file`, both set the variable to the empty string `""`. `os.environ.get("SIM_EVENT_PROBABILITY", "0.001")` then returns `""`, because the default only applies when the key is absent. `float("")` raises `ValueError`, so `Settings.from_env()` fails and the app never starts. I reproduced this with dotenv loading a file containing `SIM_EVENT_PROBABILITY=`, which gives `ValueError: could not convert string to float: ''`. The other empty-by-default vars are handled: `SIM_SEED` uses a `.strip()` truthiness check, and `DB_PATH` and `STATIC_DIR` use `or`. Only this one is not. The documented flow ("copy .env.example to .env") therefore produces a broken app. The tests miss it because `clean_env` deletes the variable instead of setting it to `""`.
**Fix:**
```python
sim_event_probability=float(os.environ.get("SIM_EVENT_PROBABILITY", "").strip() or "0.001"),
```
Add a test that sets `SIM_EVENT_PROBABILITY=""` and `SIM_SEED=""` and asserts the defaults.

## Warnings

### WR-01: Dockerfile masks a failed `uv sync`

**File:** `Dockerfile:18-24`
**Issue:** The `RUN` is `if ...; fi; uv sync --locked; rm -f /tmp/ca.pem`. Without `set -e`, the step's exit status is that of the final `rm -f`, which is always 0. A failed `uv sync` (stale lock, TLS interception error, network drop) does not fail the build. If `.venv` was partially created, the next stage's `COPY --from=backend-build /app/.venv` succeeds and ships a broken environment. The failure then only shows at runtime, via the healthcheck. The `--locked` guard is defeated.
**Fix:** Chain with `&&`, or drop the `rm` (the file lives in a throwaway layer and is never copied out):
```dockerfile
RUN --mount=type=secret,id=extra_ca \
    set -e; \
    if [ -s /run/secrets/extra_ca ]; then \
        cat /etc/ssl/certs/ca-certificates.crt /run/secrets/extra_ca > /tmp/ca.pem; \
        export SSL_CERT_FILE=/tmp/ca.pem; \
    fi; \
    uv sync --locked; \
    rm -f /tmp/ca.pem
```

### WR-02: Runtime container runs as root

**File:** `Dockerfile:26-36`
**Issue:** The final stage has no `USER`. uvicorn runs as root and serves unauthenticated endpoints. Later phases will add LLM and trade-handling code, so a compromise would have full container privileges.
**Fix:** Create a non-root user, `chown` `/app/db` to it, and add `USER app`. Check that a named volume mounted at `/app/db` is writable by that user.

### WR-03: Test suite depends on, and leaks, process environment

**File:** `backend/tests/test_config.py:8-12,23-28`; `backend/tests/test_errors.py:12`; `backend/tests/test_health.py:11`
**Issue:**
1. `load_dotenv` writes directly to `os.environ`, not through `monkeypatch`. `test_root_dotenv_is_loaded_and_real_env_wins` leaves `SIM_SEED=7` and `LLM_MOCK=true` set for the rest of the session. `clean_env` calls `delenv(raising=False)` on absent keys, which records nothing, so it cannot undo the leak. `clean_env` is also scoped to `test_config.py` only.
2. `test_errors.py` and `test_health.py` call the real `Settings.from_env()`, which reads the developer's actual project-root `.env`, secrets included. They then run against whatever the machine has. With CR-01 present, a developer who has copied `.env.example` to `.env` gets a collection-time failure in two modules.
**Fix:** Build `Settings(...)` explicitly in the `make_settings` helpers, with no env or `.env` involved. In `test_config.py`, `monkeypatch.setenv(name, "")` before `load_dotenv`, so teardown restores the value. Alternatively move `clean_env` to `conftest.py` and use `monkeypatch.setattr(config, "load_dotenv", ...)` where the dotenv path is not under test.

### WR-04: `getHealth` ignores HTTP status and can render an empty status

**File:** `frontend/src/lib/api.ts:4-6`; `frontend/src/app/page.tsx:10-12`
**Issue:** `res.ok` is never checked. A `404`, `500` or `502` that returns the JSON envelope (`{"error": "..."}`) is cast to `Health` with `status === undefined`. `page.tsx` then calls `setApi(undefined)`, so the `api-status` span renders empty instead of "down". The cast also hides the contract's error shape. Because this is the typed API client every later call will copy, the pattern will spread.
**Fix:**
```ts
const res = await fetch("/api/health");
if (!res.ok) throw new Error(`health ${res.status}`);
return (await res.json()) as Health;
```

### WR-05: Non-GET/POST methods on unknown `/api/*` paths do not return the contract's 404

**File:** `backend/app/main.py:28,32-33`
**Issue:** The contract says any unknown `/api/*` path, with any method, returns `404 {"error": "Not found"}`. The catch-all lists only GET, POST, PUT, DELETE and PATCH. OPTIONS (and TRACE) on `/api/anything` do not fully match it. When the static mount exists, the `Mount("/")` fully matches first and `StaticFiles` returns `405 {"error": "Method Not Allowed"}`. Without the mount it is also a 405. This is a minor contract deviation, but the contract calls it frozen.
**Fix:** Add `"OPTIONS"` to the method list, and consider `"HEAD"`, which is implied by GET.

## Info

### IN-01: Validation-error message formatting is inconsistent for non-field locations

**File:** `backend/app/errors.py:17-19`
**Issue:** Filtering `p != "body"` drops any path element named "body", including a real field called `body`. A missing or invalid JSON body yields `loc == ("body",)`, so the message becomes `": Field required"` with a leading colon and no field name. A JSON decode error yields `"0: JSON decode error"`. Query errors yield `"query.x: ..."`. The contract only needs a human-readable string.
**Fix:** Strip only a leading `"body"`, and drop the `"loc: "` prefix when `loc` is empty:
```python
parts = first["loc"][1:] if first["loc"][:1] == ("body",) else first["loc"]
loc = ".".join(map(str, parts))
msg = f"{loc}: {first['msg']}" if loc else first["msg"]
```

### IN-02: `test_health_is_side_effect_free` asserts nothing about side effects

**File:** `backend/tests/test_health.py:20-25`
**Issue:** It only checks that two calls return the same body, which is already covered by `test_health_ok`. It does not check that no DB file or other state was created, which the name implies.
**Fix:** Assert `not (tmp_path / "t.db").exists()` after the calls, or delete the test.

### IN-03: `.gitignore` gaps

**File:** `.gitignore:197-214`
**Issue:** SQLite journal files (`db/*.db-journal`) are not ignored, only `-wal` and `-shm`. The generic `out/` and `env/` patterns match directories with those names anywhere in the tree. `out/` is intended only for `frontend/out`.
**Fix:** Add `db/*.db-journal`, and anchor the patterns as `/frontend/out/`, `/env/`.

---

_Reviewed: 2026-10-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
