# Phase 1: Walking Skeleton - Research

**Researched:** 2026-10-06
**Domain:** Repo hygiene, uv/FastAPI backend skeleton, Next 16.4 static-export skeleton, frozen API/SSE contract doc, Docker multi-stage build on a Windows 11 + Avast machine, host Playwright smoke
**Confidence:** HIGH for backend, frontend, hygiene, host Playwright (all run in a scratch project this session). MEDIUM for the contract doc (decisions to confirm). LOW for Docker-in-container TLS (the Docker daemon was not running, so no containerized build was possible).

No CONTEXT.md exists for this phase (user chose to continue without discuss-phase). Scope constraints below come from ROADMAP.md, REQUIREMENTS.md and PROJECT.md "Resolved contract decisions".

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Untrack `backend/static/` and `test/node_modules/`, gitignore them, `.gitattributes` forces LF | Exact `git rm --cached` commands, full `.gitignore` additions, `.gitattributes` content. Found extra tracked artifacts (`test/playwright-report`, `test/test-results`) and a `.gitignore` bug (`lib/`, `build/`, `dist/` hide frontend source dirs and hide them from Tailwind scanning) |
| FND-02 | uv backend in `backend/`, app factory under `backend/app/`, `uv run python -m pytest` passes | Verified pyproject layout (virtual project, `[project.optional-dependencies] dev`), `create_app()` + `--factory`, test files |
| FND-03 | Next TypeScript project, `output: 'export'`, Tailwind | Verified scratch scaffold (no create-next-app), config, CSS, layout, page, build output |
| FND-04 | Written API/SSE contract in `planning/` | Contract outline with concrete shapes, plus the list of conflicts between `MARKET_INTERFACE.md` and PROJECT.md decision 3 and a recommended reconciliation |
| FND-05 | Env config incl. `DB_PATH`, `LLM_MOCK`, `SIM_SEED`, `SIM_EVENT_PROBABILITY`, root `.env` | Verified `config.py` with python-dotenv; found that this shell already exports `LLM_MOCK=false` and `OPENROUTER_API_KEY`, so real env beats `.env` |
| FND-06 | README.md and CLAUDE.md status lines match reality | Exact false claims to remove (file/line list) |
| PORT-08 | `GET /api/health` for Docker | Verified: port is not open until lifespan startup completes, so a plain 200 is enough; no 503 state needed |
| PKG-01 | Multi-stage Dockerfile (Node 24 -> Python 3.12 + uv `--locked`), one worker, port 8000 | Draft Dockerfile with optional CA build-secret pattern (UNTESTED, daemon down), `.dockerignore`, probe + decision tree, verification commands |
</phase_requirements>

## Summary

Phase 1 is almost entirely mechanical, and nearly everything was proven in a scratch project this session. A minimal uv backend (FastAPI 0.142.2, uvicorn 0.54.0, python-dotenv 1.2.4; pytest 9.1.1 as a dev extra) passes `uv run python -m pytest`, answers `/api/health` with 200, serves a static export mounted last and conditionally, and returns `{"error": ...}` for 404 and validation failures. A hand-written Next 16.4.0 + React 19.3.0 + TypeScript 7.0.2 + Tailwind 4.3.3 project builds a static export on this machine in about 10 s with `npm run build`. A host-run Playwright 1.63.0 test, using the Chromium already installed, loaded the page served by FastAPI and saw the placeholder call `/api/health` successfully. **App Control did not block anything**: Chromium, the Next/Turbopack/Tailwind native binaries, `pytest.exe` and `uvicorn.exe` all ran. The §13 #23 decision (Playwright on the host, no Playwright container) therefore stands.

The two machine-specific risks resolved differently than feared. (1) **No TLS interception was observable today**: Node, openssl, curl and a fresh-cache uv (without `UV_SYSTEM_CERTS`) all verified real public CA chains to npm, PyPI, GitHub and OpenRouter. Avast interception appears to be off or intermittent, so the Dockerfile must build correctly in both states. The Avast root already exists as a PEM at `C:\ProgramData\Avast Software\Avast\wscert.pem` (the file `NODE_EXTRA_CA_CERTS` points at; same SHA-1 thumbprint as the cert in `LocalMachine\Root`), so no export from the cert store is needed. (2) **Docker Desktop is installed but not running** (CLI 29.7.2, WSL2 backend), so the containerized `npm ci` / `uv sync` was not tested. The plan must start with a human-action checkpoint to start Docker Desktop, then run a two-command TLS probe, then the build. The recommended pattern is an *optional* BuildKit secret (`RUN --mount=type=secret,id=extra_ca`, no-op when the secret is not passed) used only in throwaway build stages, so the cert is never in the final image and verification is never disabled.

Several non-obvious traps were found and are called out below: `.gitignore` lines `lib/`, `build/`, `dist/` would silently ignore `frontend/src/lib/` (and hide it from Tailwind's scanner); `ROOT_DIR` derived from `__file__` is `/` inside Docker, so `DB_PATH` must be set in the Dockerfile; this shell already exports `LLM_MOCK=false`, so a `.env` value for it is ignored when `override=False`; Starlette 1.7.0's `TestClient` now prefers `httpx2` over `httpx`; and `next dev` writes an `AGENTS.md` into the project unless `agentRules: false` is set.

**Primary recommendation:** Execute as five small plans in three waves: (W1) repo hygiene + contract doc in parallel; (W2) backend skeleton + frontend skeleton in parallel; (W3) Dockerfile + host Playwright smoke, which opens with a human checkpoint to start Docker Desktop and run the TLS probe. Keep Phase 1 free of DB, market, LLM and chart code.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Health check | API / Backend | -- | `GET /api/health` is a backend route; the Docker HEALTHCHECK calls it |
| Serving the static export | API / Backend (FastAPI `StaticFiles`) | CDN / Static (n/a in v1) | One origin, one port: FastAPI mounts the export last |
| Placeholder page + dark theme | Browser / Client | -- | Pure client component; no SSR (static export) |
| Same-origin API call from the page | Browser / Client | API / Backend | `fetch("/api/health")` proves wiring end to end; dev proxy only in `next dev` |
| Error shape `{"error": ...}` | API / Backend | -- | One exception handler module, shared by all later routes |
| Env/config loading | API / Backend | -- | `config.py` reads env; local dev also loads root `.env`; Docker injects env |
| Contract doc | Planning artifact | Backend + Frontend types | Single reference; code mirrors it later |
| Docker build | Build / packaging | -- | Node stage builds export; Python stage builds venv; runtime stage assembles |
| Host Playwright smoke | Test tooling (host) | -- | Runs against `http://localhost:8000` (container) |

## Project Constraints (from CLAUDE.md)

From `C:\Users\shola\.claude\CLAUDE.md` (user scope), `./CLAUDE.md` and `./.claude/CLAUDE.md`:
- Never disable TLS verification (no `verify=False`, `--allow-insecure-host`, `UV_INSECURE_HOST`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `strict-ssl false`, `-k`). Change only the source of trusted roots.
- Python: `uv` only. `uv run xxx`, `uv add xxx`; never `python3 xxx` / `pip install`. Tests: `uv run python -m pytest` (memory note: App Control blocked the bare `pytest.exe`; not reproduced on 2026-10-06 but keep the command, it is also the requirement text).
- Simple, incremental, small steps; validate each increment. No over-engineering, no defensive programming, exceptions only when needed.
- Latest library APIs. Short modules/functions, clear names, docstrings over comments, no emojis in code/logs/prints, concise README.
- Identify root cause before fixing; do not apply workarounds.
- `.claude/CLAUDE.md` (GSD): direct repo edits happen through a GSD workflow. The `GSD:` blocks in `.claude/CLAUDE.md` are managed; do not hand-edit them.
- `./CLAUDE.md` imports `@planning/PLAN.md`; its status paragraph is one of the FND-06 fixes.
- Cerebras skill (`.claude/skills/cerebras/SKILL.md`) applies to Phase 5 only.

## Standard Stack

### Core (Phase 1 installs only what Phase 1 needs; later phases `uv add` / `npm install` their own)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.142.2 | App, routes, StaticFiles, exception handlers | Fixed by PLAN.md. `[VERIFIED: uv.lock resolved in scratch backend]` |
| uvicorn[standard] | 0.54.0 | ASGI server, `--factory`, `--workers 1`, `--timeout-graceful-shutdown` | `[VERIFIED: uv.lock resolved in scratch backend]` |
| python-dotenv | 1.2.4 | Load project-root `.env` in local dev | Decision 12. `[VERIFIED: uv.lock resolved in scratch backend]` |
| pytest (dev extra) | 9.1.1 | Tests via `uv run python -m pytest` | `[VERIFIED: uv.lock resolved in scratch backend]` |
| httpx2 (dev extra) | resolve at install | Starlette `TestClient` backend | Starlette 1.7.0 `testclient.py` imports `httpx2` first and warns "Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead." `[CITED: starlette 1.7.0 source, starlette/testclient.py lines 33-51, read in scratch .venv]`. Flagged SUS by the legitimacy gate (see audit); install was blocked in this session, so it is NOT verified to work. Fallback: `httpx` 0.28.1 + a `filterwarnings` entry (verified working, 3 tests passed) |
| next | 16.4.0 | Static export | `[VERIFIED: npm registry 2026-10-06; built in scratch]` |
| react / react-dom | 19.3.0 | UI | `[VERIFIED: npm registry; built in scratch]` |
| typescript | 7.0.2 | Types | `[VERIFIED: npm registry; next build type-check passed in scratch]` |
| tailwindcss + @tailwindcss/postcss | 4.3.3 | CSS-first dark theme | `[VERIFIED: npm registry; theme colors reached built CSS]` |
| postcss | 8.5.29 | Required by `@tailwindcss/postcss` | `[VERIFIED: npm registry]` |
| @types/node | 24.19.1 (line 24) | Types; `npm install @types/node@24` | npm default tag is 26.6.4 which does not match the Node 24 build stage. `[VERIFIED: npm registry]` |
| @types/react, @types/react-dom | 19.3.0 | Types | `[VERIFIED: npm registry]` |
| @playwright/test (in `test/`) | 1.63.0 | Host smoke test | `[VERIFIED: npm registry; test runner passed in scratch]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `app = create_app()` at module level | `uvicorn --factory app.main:create_app` | `--factory` verified working; avoids import-time `.env` load and static-dir check. Use `--factory` |
| `create-next-app` | Hand-written project | create-next-app enables Cache Components and writes agent files. Hand-write (done in scratch) |
| `[dependency-groups] dev` | `[project.optional-dependencies] dev` | Memory/requirements say `uv sync --extra dev`; extras are also excluded from the Docker `uv sync` by default. Use extras |
| 503 until ready | plain 200 | Not needed: uvicorn does not open the port until lifespan startup completes (verified) |

**Installation (matches what was run in scratch):**
```bash
# backend/   (user rule: uv add, never pip)
cd backend
uv add fastapi "uvicorn[standard]" python-dotenv
uv add --optional dev pytest httpx2        # httpx2 is SUS: gate behind a human-verify checkpoint; fallback: httpx
uv sync --extra dev

# frontend/  (hand-written package.json first; no "type" field)
cd frontend
npm install next@16.4.0 react@19.3.0 react-dom@19.3.0
npm install -D typescript@7.0.2 @types/node@24 @types/react @types/react-dom tailwindcss @tailwindcss/postcss postcss

# test/      (after untracking the committed node_modules; reuses the existing node_modules)
cd test
npm install -D @playwright/test@1.63.0
```

**Version verification:** `npm view next version` -> 16.4.0 (published 2026-10-06T18:35Z), `react` 19.3.0, `typescript` 7.0.2, `tailwindcss` 4.3.3, `@tailwindcss/postcss` 4.3.3, `postcss` 8.5.29, `@playwright/test` 1.63.0 `[VERIFIED: npm registry, this session]`. Python versions are those `uv add` resolved into the scratch `uv.lock` (fastapi 0.142.2, starlette 1.7.0, pydantic 2.13.5, uvicorn 0.54.0, python-dotenv 1.2.4, pytest 9.1.1). Base images: `node:24-slim`, `python:3.12-slim` and `ghcr.io/astral-sh/uv:0.12.17` all return HTTP 200 for their manifests `[VERIFIED: registry manifest requests]`. Local uv is 0.12.17, Node is v26.8.1 (Docker uses Node 24; the lockfile is portable, see Pitfall 8).

## Package Legitimacy Audit

Run with `gsd-tools query package-legitimacy check` on 2026-10-06. Every `SUS` verdict below has a benign cause: `too-new` means the *latest release* of a very old, very popular project was published days ago; `unknown-downloads` means the PyPI check returns no download count. None has a postinstall script (`npm view <pkg> scripts.postinstall` was empty for next, react, tailwindcss, @tailwindcss/postcss, @playwright/test). The planner should still insert **one batched `checkpoint:human-verify`** before the first backend install and one before the first frontend install, showing the resolved versions from the lockfile.

| Package | Registry | Age / latest release | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| next | npm | latest 2026-10-06 | 76.9M/wk | github.com/vercel/next.js | SUS (too-new) | Flagged: human-verify; fallback 16.3.x |
| react | npm | latest 2026-09-09 | 224M/wk | github.com/react/react | SUS (too-new) | Flagged: human-verify |
| react-dom | npm | latest 2026-09-09 | 212M/wk | github.com/react/react | SUS (too-new) | Flagged: human-verify |
| typescript | npm | 2026-07-08 | 365M/wk | github.com/microsoft/TypeScript | OK | Approved |
| tailwindcss | npm | 2026-07-16 | 163M/wk | github.com/tailwindlabs/tailwindcss | OK | Approved |
| @tailwindcss/postcss | npm | 2026-07-16 | 49.6M/wk | github.com/tailwindlabs/tailwindcss | OK | Approved |
| postcss | npm | latest 2026-10-05 | 360M/wk | -- | SUS (too-new) | Flagged: human-verify |
| @types/node | npm | latest 2026-10-01 | 548M/wk | DefinitelyTyped | SUS (too-new) | Flagged: human-verify |
| @types/react, @types/react-dom | npm | latest 2026-09-09 | 205M / 176M per wk | DefinitelyTyped | SUS (too-new) | Flagged: human-verify |
| @playwright/test | npm | 2026-09-04 | 86M/wk | github.com/microsoft/playwright | OK | Approved |
| fastapi | PyPI | latest 2026-09-30 | n/a | github.com/fastapi/fastapi | SUS (too-new, unknown-downloads) | Flagged: human-verify |
| uvicorn | PyPI | latest 2026-09-25 | n/a | github.com/Kludex/uvicorn | SUS (too-new, unknown-downloads) | Flagged: human-verify |
| python-dotenv | PyPI | latest 2026-10-01 | n/a | github.com/theskumar/python-dotenv | SUS (too-new, unknown-downloads) | Flagged: human-verify |
| pytest | PyPI | latest 2026-06-19 | n/a | github.com/pytest-dev/pytest | SUS (unknown-downloads) | Flagged: human-verify |
| pytest-asyncio (Phase 2+) | PyPI | latest 2026-05-26 | n/a | -- | SUS (unknown-downloads) | Not needed in Phase 1 |
| httpx | PyPI | latest 2024-12-06 | n/a | -- | SUS (unknown-downloads) | Fallback only |
| httpx2 | PyPI | 2026-09-23 | n/a | github.com/pydantic/httpx2 | SUS (too-new, unknown-downloads) | Flagged: human-verify. Starlette's own source names it. Install was denied by the session's permission classifier, so it is unproven here |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** next, react, react-dom, postcss, @types/node, @types/react, @types/react-dom, fastapi, uvicorn, python-dotenv, pytest, httpx, httpx2 (all pinned by lockfiles; one batched human-verify before install)

## Architecture Patterns

### System Architecture Diagram (what the skeleton proves)

```
 Developer (Windows host)                         Docker (Linux VM, WSL2 backend)
 ------------------------                         -------------------------------------------
 git repo
   |
   |  docker build  [--secret id=extra_ca,src=<Avast PEM>]   (secret only if TLS probe fails)
   v
 Stage 1  node:24-slim         npm ci  --> npm run build  --> /fe/out (static export)
 Stage 2  python:3.12-slim     uv sync --locked           --> /app/.venv   (cert, if any, dies here)
 Stage 3  python:3.12-slim     COPY .venv + app/ + out/ -> /app/static
   |
   v
 docker run -p 8000:8000  -->  uvicorn --factory app.main:create_app --workers 1
                                    |
 Browser / host Playwright          |  create_app(Settings.from_env())
   |  GET /            ------------>|  routes first:  GET /api/health -> 200 {"status":"ok"}
   |  GET /api/health  ------------>|                 /api/{anything else} -> 404 {"error": ...}
   |                                |  mount last:    StaticFiles("/app/static", html=True)  (only if dir exists)
   |<------ placeholder page (dark, Tailwind) that fetch("/api/health") and shows "ok"
```

### Recommended Project Structure (Phase 1 files only)

```
finally/
├── .gitattributes            # LF for .sh, Dockerfile, env files, lockfiles
├── .gitignore                # + node_modules, .next, out, backend/static, test reports, db/*.db*; fix lib/ build/ dist/
├── .dockerignore             # keep .env, .venv, node_modules, .git, planning out of the build context
├── .env.example              # variable NAMES only
├── Dockerfile                # 3 stages (node, python build, runtime)
├── README.md / CLAUDE.md     # status lines corrected
├── db/.gitkeep               # runtime volume mount target (PLAN.md §4)
├── backend/
│   ├── pyproject.toml        # virtual project (no [build-system]), extras: dev
│   ├── uv.lock               # committed
│   ├── .python-version       # "3.12" (optional, keeps local == Docker)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py         # Settings.from_env(): .env + env vars
│   │   ├── errors.py         # {"error": ...} handlers
│   │   └── main.py           # create_app(), lifespan, /api/health, /api catch-all, static mount last
│   └── tests/test_health.py, test_config.py, test_errors.py
├── frontend/
│   ├── package.json, package-lock.json   # no "type" field
│   ├── next.config.ts, postcss.config.mjs, tsconfig.json (commit the Next-rewritten version)
│   └── src/app/layout.tsx, page.tsx, globals.css
├── planning/API_CONTRACT.md  # the frozen contract (FND-04)
└── test/package.json, package-lock.json, playwright.config.ts, smoke.spec.ts
```
Note: put the frontend under `frontend/src/app/` (Next auto-detects `src/app`); the scratch build used `app/` at the root of `frontend/`, both work. `frontend/src/lib/` is where later phases put `api.ts`, `format.ts`, so fix `.gitignore` first (Pitfall 1).

### Pattern 1: Virtual uv project + app factory + `--factory` (verified)

**What:** No `[build-system]` means uv treats the project as virtual: `uv sync` installs dependencies only, so Docker needs no two-step "deps then project" dance, and app code is imported from the working directory (`pythonpath = ["."]` in pytest config).
**Example (all run in scratch; 3 tests passed):**
```toml
# backend/pyproject.toml  (after: uv add fastapi "uvicorn[standard]" python-dotenv ; uv add --optional dev pytest httpx2)
[project]
name = "finally-backend"
version = "0.1.0"
description = "FinAlly backend"
requires-python = ">=3.12"
dependencies = ["fastapi>=0.142.2", "python-dotenv>=1.2.4", "uvicorn[standard]>=0.54.0"]

[project.optional-dependencies]
dev = ["httpx2", "pytest>=9.1.1"]          # httpx2 pin comes from uv add

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```
```python
# backend/app/config.py
"""Settings read from the environment. Local dev also loads the project-root .env."""
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent        # "/" inside Docker: the Dockerfile must set DB_PATH


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str
    massive_api_key: str
    llm_mock: bool
    db_path: Path
    sim_seed: int | None
    sim_event_probability: float
    static_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        """Load the root .env (real env vars win) and read every setting."""
        load_dotenv(ROOT_DIR / ".env", override=False)
        seed = os.environ.get("SIM_SEED", "").strip()
        return cls(
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY", "").strip(),
            massive_api_key=os.environ.get("MASSIVE_API_KEY", "").strip(),
            llm_mock=os.environ.get("LLM_MOCK", "false").strip().lower() == "true",
            db_path=Path(os.environ.get("DB_PATH") or ROOT_DIR / "db" / "finally.db"),
            sim_seed=int(seed) if seed else None,
            sim_event_probability=float(os.environ.get("SIM_EVENT_PROBABILITY", "0.001")),
            static_dir=Path(os.environ.get("STATIC_DIR") or BACKEND_DIR / "static"),
        )
```
(`0.001` matches `event_probability: float = 0.001` at `planning/MARKET_SIMULATOR.md:215` `[VERIFIED: grep + read of planning/MARKET_SIMULATOR.md]`.)
```python
# backend/app/errors.py
"""One error shape for every failure: {"error": "..."}."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def register_error_handlers(app: FastAPI) -> None:
    """Map HTTP errors to their status and validation errors to 400."""

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first["loc"] if p != "body")
        return JSONResponse({"error": f"{loc}: {first['msg']}"}, status_code=400)
```
```python
# backend/app/main.py
"""FastAPI app factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .errors import register_error_handlers


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the app. Static files are mounted last and only if the export exists."""
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        yield

    app = FastAPI(lifespan=lifespan)
    register_error_handlers(app)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
    def api_not_found(path: str):
        raise HTTPException(status_code=404, detail="Not found")

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    return app
```
Run: `uv run uvicorn --factory app.main:create_app --reload` (local), `STATIC_DIR=../frontend/out` to serve a fresh export locally (avoids copying into `backend/static`).

Behaviors verified (each from a real run): `GET /api/health` 200 `{"status":"ok"}`; `GET /api/nope` 404 `{"error": "Not found"}` even when `static/` (with a `404.html`) exists, because the catch-all `/api/{path}` route is registered before the mount; `GET /missing-page` returns Next's `404.html` with 404; `POST` with a bad body returns 400 `{"error": "a: Input should be a valid integer, ..."}`; `DELETE /api/health` returns 404 (the catch-all matches other methods; acceptable, note in contract). With a slow lifespan (4 s) the port refused connections for 4 s and `/api/health` answered 200 only after "Application startup complete" `[VERIFIED: scratch run]`.

### Pattern 2: Static-export Next skeleton (verified: build 10 s, `out/` produced, dev proxy works)

```ts
// frontend/next.config.ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const devProxy: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }];
  },
};

const nextConfig: NextConfig = {
  ...(isDev ? devProxy : { output: "export" }),
  images: { unoptimized: true },
  compress: false,      // keeps the dev SSE proxy unbuffered (Phase 2)
  agentRules: false,    // otherwise `next dev` writes AGENTS.md into frontend/
};
export default nextConfig;
```
Defining `rewrites()` unconditionally prints a warning on the export build ("Specified \"rewrites\" will not automatically work with \"output: export\""), so spread it only in dev (as above, build is warning-free) `[VERIFIED: scratch build + next dev on :3056]`.

```css
/* frontend/src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-surface: #0d1117;
  --color-panel: #161b22;
  --color-border: #30363d;
  --color-accent: #ecad0a;     /* PLAN.md section 2 accent yellow */
  --color-primary: #209dd7;    /* blue primary */
  --color-secondary: #753991;  /* submit buttons */
}
```
```js
// frontend/postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } };
```
```tsx
// frontend/src/app/layout.tsx   (no next/font/google: build-time fetch breaks intercepted/offline builds)
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FinAlly" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-slate-200 antialiased">{children}</body>
    </html>
  );
}
```
```tsx
// frontend/src/app/page.tsx   (verified: Playwright saw api-status == "ok" served by FastAPI)
"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [api, setApi] = useState("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setApi(d.status))
      .catch(() => setApi("down"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 data-testid="app-title" className="text-3xl font-semibold text-accent">FinAlly</h1>
      <p className="text-sm text-slate-400">
        API: <span data-testid="api-status" className="text-primary">{api}</span>
      </p>
    </main>
  );
}
```
`package.json`: `{"name":"finally-frontend","private":true,"scripts":{"dev":"next dev","build":"next build"}, ...deps}`; optionally `"engines": {"node": ">=24"}`. Do NOT add `"type"`. The first `next build` rewrites `tsconfig.json` (sets `jsx: react-jsx`, `allowJs`, `esModuleInterop`, `resolveJsonModule`, adds `.next/dev/types/**/*.ts` to `include`); run it once and commit the rewritten file so later builds do not dirty the tree. `next build` also creates `next-env.d.ts` (gitignore it).

### Pattern 3: Host Playwright smoke (verified end to end)

```ts
// test/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:8000" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```
```ts
// test/smoke.spec.ts
import { test, expect } from "@playwright/test";

test("placeholder page loads and reaches the API", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("app-title")).toHaveText("FinAlly");
  await expect(page.getByTestId("api-status")).toHaveText("ok");
});
```
Run: `cd test && BASE_URL=http://localhost:8000 npx playwright test` -> `1 passed`.

### Anti-Patterns to Avoid
- **`StaticFiles(directory="static")` at import / unconditional:** raises when the dir is absent. Mount last, only if `is_dir()` (done above).
- **Module-level `app = create_app()`:** loads `.env` and checks the filesystem at import. Use `--factory`.
- **Leaving the stale local `backend/static/`:** `create_app` mounts it if present, so local runs would serve the OLD export. Delete the local copy after untracking (it is stale by definition).
- **Passing the Avast cert via `COPY` + `update-ca-certificates` in the final stage:** bakes a MITM root into the shipped image. Use the secret mount in throwaway stages.
- **`SSL_CERT_FILE=<avast.pem>` alone for uv:** it REPLACES uv's default roots (only certificates in that file are trusted). Always build a combined bundle (system bundle + Avast) `[CITED: docs.astral.sh/uv/concepts/authentication/certificates/ via Context7 /astral-sh/uv]`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Static SPA serving with caching/range handling | Custom file route | `StaticFiles(html=True)` mounted last | Handles index.html, 404.html, path traversal |
| `.env` parsing | Manual line parser | `python-dotenv` `load_dotenv(path, override=False)` | Quoting, CRLF, comments |
| Error envelope | Per-route try/except | Two exception handlers (`errors.py`) | One shape for every later route |
| CA injection into builds | `curl -k`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `UV_INSECURE_HOST` | BuildKit secret + `NODE_EXTRA_CA_CERTS` / combined `SSL_CERT_FILE` | Forbidden by user rules; verification must stay on |
| Docker readiness | Sleep loops | `HEALTHCHECK` + poll `/api/health` | Port is closed until lifespan startup completes |
| Frontend scaffolding | `create-next-app` | Hand-written files above | Avoids Cache Components default, AGENTS.md, `"type"` trap |

**Key insight:** Phase 1 should add almost no logic. Everything written here becomes the template for later phases, so keep each file tiny and standard.

## Common Pitfalls

### Pitfall 1: `.gitignore` Python-template lines hide frontend source
**What goes wrong:** `lib/`, `build/`, `dist/` (also `lib64/`, `parts/`, `var/`, `downloads/`, `eggs/`, `sdist/`) are unanchored, so `frontend/src/lib/*` (planned home of `api.ts`, `format.ts`) and any `build`/`dist` directory are ignored by git, and Tailwind v4's automatic source detection skips gitignored paths too.
**Evidence:** `frontend/src/lib/api.ts => .gitignore:17:lib/`, `frontend/src/components/build/x.ts => .gitignore:11:build/`, `frontend/dist/x => .gitignore:13:dist/` `[VERIFIED: git check-ignore -v output, this session]`. Tailwind: "dependencies are usually listed in your .gitignore file and ignored by Tailwind by default" `[CITED: tailwindcss.com/docs/detecting-classes-in-source-files]`.
**How to avoid:** Delete (or anchor to `/backend/`) the packaging block lines `build/ develop-eggs/ dist/ downloads/ eggs/ .eggs/ lib/ lib64/ parts/ sdist/ var/ wheels/`. The backend is a virtual app, never built as a package. Verify with `git check-ignore -v frontend/src/lib/api.ts` returning nothing.
**Warning signs:** a new `frontend/src/lib/` file does not appear in `git status`.

### Pitfall 2: `ROOT_DIR` is `/` inside the container
**What goes wrong:** `Path(__file__).parents[1].parent` is `/` when code lives at `/app/app/config.py`, so the default `DB_PATH` becomes `/db/finally.db` and `.env` lookup is `/.env`.
**How to avoid:** `ENV DB_PATH=/app/db/finally.db` and `RUN mkdir -p /app/db` in the Dockerfile. `.env` lookup is then a harmless no-op (and `.env` is excluded from the build context).

### Pitfall 3: Real env vars beat `.env`, and this shell has some preset
**What goes wrong:** `env` in this shell shows `LLM_MOCK=false` and `OPENROUTER_API_KEY=<set>` `[VERIFIED: env listing, secrets redacted]`. With `override=False`, a root `.env` line `LLM_MOCK=true` is silently ignored (observed: `.env` had `SIM_SEED=7`, `LLM_MOCK=true`; result `7 False`).
**How to avoid:** Keep `override=False` (it matches Docker semantics and PITFALLS.md #25). Verify FND-05 with variables that are NOT preset (`SIM_SEED`, `DB_PATH`, `SIM_EVENT_PROBABILITY`), and in pytest use `monkeypatch.delenv(..., raising=False)` for every variable under test. Document: to run local mock mode, `LLM_MOCK=true uv run uvicorn ...` (explicit env wins). Never `cat .env` (a secret-read guard blocks it; use `.env.example` for names).

### Pitfall 4: Starlette 1.7.0 `TestClient` wants `httpx2`
**What goes wrong:** With plain `httpx` the tests pass but emit `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` `[VERIFIED: scratch pytest output; CITED: starlette/testclient.py:33-51]`.
**How to avoid:** `uv add --optional dev httpx2` after the human-verify checkpoint (the earlier project `.venv` in `backend/` already contained `httpx2` 2.13.1, i.e. it was used before). If the checkpoint rejects it, keep `httpx` and add `filterwarnings = ["ignore::starlette.exceptions.StarletteDeprecationWarning"]`-style config.

### Pitfall 5: `next dev` writes `AGENTS.md`; unconditional `rewrites()` warns on export
**How to avoid:** `agentRules: false` and the spread-in-dev config above. `[VERIFIED: scratch]`

### Pitfall 6: Docker Desktop is off
**What goes wrong:** `docker version` shows the client but "failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine". `[VERIFIED: docker version, this session]`. Docker Desktop is installed at `C:\Program Files\DockerDesktop` with the `docker-desktop` WSL2 distro `[VERIFIED: ls, wsl --status]`.
**How to avoid:** First task of the Docker plan is a human-action checkpoint: start Docker Desktop and confirm `docker info` works. PKG-01 cannot be verified without it; there is no fallback.

### Pitfall 7: Git Bash mangles `docker build --secret src=/c/...`
**How to avoid:** Run the build from PowerShell with a Windows path, or prefix `MSYS_NO_PATHCONV=1` in Git Bash.

### Pitfall 8: Windows-generated `package-lock.json` for a Linux `npm ci`
**Verified safe:** the scratch lockfile (created on Windows, Node 26 / npm 11) contains `@next/swc-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, `lightningcss-linux-x64-gnu` and `@img/sharp-linux-x64`, and `npm ci` from a clean directory succeeded `[VERIFIED: grep of lockfile + npm ci run]`. Keep `node:24-slim` (glibc), not Alpine. Set `NEXT_TELEMETRY_DISABLED=1` in the Node stage.

### Pitfall 9: README/CLAUDE.md false claims (FND-06)
`README.md` Status says "Done: market data subsystem ... in `backend/app/market/`" and the Development block runs `uv run pytest` and `uv run market_data_demo.py`; `CLAUDE.md` says "the market data component has been completed ... `planning/MARKET_DATA_SUMMARY.md` ... `planning/archive`". None of `backend/app/market/*.py`, `market_data_demo.py`, `planning/MARKET_DATA_SUMMARY.md` or `planning/archive` exist `[VERIFIED: ls and find; only stale __pycache__ remains]`. Rewrite to: foundation skeleton in place; everything else to build; command `uv run python -m pytest`; add `DB_PATH`, `SIM_SEED`, `SIM_EVENT_PROBABILITY` to the env table; point CLAUDE.md at `planning/API_CONTRACT.md`. Do not edit the managed `GSD:` blocks in `.claude/CLAUDE.md`.

## Repo hygiene: exact commands and file contents (FND-01)

Current state `[VERIFIED: git ls-files counts this session]`: 42 tracked files under `backend/static`, 64 under `test/node_modules`, plus `test/playwright-report/index.html` and `test/test-results/.last-run.json` (also build output; not named in FND-01, untrack them too). `test/` has no `package.json`, so the committed `node_modules` is the only record of the Playwright version (`@playwright/test` 1.63.0). Existing `.gitignore` already ignores `.env`, `.venv`, `__pycache__`, `.pytest_cache`.

```bash
# 1. edit .gitignore + add .gitattributes first, then:
git rm -r --cached --quiet backend/static test/node_modules test/playwright-report test/test-results
rm -rf backend/static            # stale old export; local backend would otherwise serve it
# keep test/node_modules on disk: host Playwright already works from it
git add .gitignore .gitattributes
git commit -m "chore: untrack build artifacts and node_modules; add gitattributes"
```
`--cached` leaves working copies; once ignored they disappear from `git status`.

`.gitignore` additions (and delete the packaging block lines listed in Pitfall 1):
```
# Node / Next
node_modules/
.next/
out/
next-env.d.ts
*.tsbuildinfo

# Built frontend copied into the backend (Docker COPY target / local copy)
backend/static/

# Playwright output
test/playwright-report/
test/test-results/

# Runtime database (volume mount target)
db/*.db
db/*.db-wal
db/*.db-shm
```
`db/.gitkeep` (empty) is committed per PLAN.md section 4. `.env.example` lists names only: `OPENROUTER_API_KEY=`, `MASSIVE_API_KEY=`, `LLM_MOCK=false`, `DB_PATH=`, `SIM_SEED=`, `SIM_EVENT_PROBABILITY=`.

`.gitattributes` (no `* text=auto`, to avoid a repo-wide renormalization diff; `core.autocrlf=true` is set on this machine `[VERIFIED: git config]`):
```
*.sh                 text eol=lf
Dockerfile           text eol=lf
.dockerignore        text eol=lf
.env*                text eol=lf
*.env                text eol=lf
docker-compose*.yml  text eol=lf
uv.lock              text eol=lf
package-lock.json    text eol=lf
*.ps1                text eol=crlf
```
Check without any files existing: `git check-attr eol -- scripts/start_mac.sh Dockerfile .env.example` -> `eol: lf` for each.

## Docker build under Avast (PKG-01 research flag)

### What was observed on this machine (2026-10-06)

| Check | Result |
|-------|--------|
| `docker version` / `docker info` | Client 29.7.2 OK; daemon unreachable (Docker Desktop not running) `[VERIFIED]` |
| Avast root cert | `C:\ProgramData\Avast Software\Avast\wscert.pem`: 1 certificate, self-signed, `CA:TRUE`, CN=Avast Web/Mail Shield Root, valid to 2040-01-01, SHA-1 `5D:C2:77:DD:58:FA:D5:56:17:2A:C9:13:D9:C8:69:5C:8B:5A:72:B9`; identical thumbprint present in `Cert:\LocalMachine\Root` and `CurrentUser\Root` `[VERIFIED: openssl x509 + Get-ChildItem Cert:]`. Export from the store is therefore unnecessary; `NODE_EXTRA_CA_CERTS` already points at the file (the value contains a double backslash before `wscert.pem`; use the explicit path in commands) |
| Interception from the host right now | None observed. `openssl s_client`, Node `tls.connect`, `curl`, and uv with a fresh cache and no `UV_SYSTEM_CERTS` all saw real issuers (Google Trust Services, GlobalSign, Let's Encrypt, Sectigo, Amazon) and verified OK `[VERIFIED: command output]`. The user's CLAUDE.md says interception happens, so treat it as toggled/intermittent and build for both states |
| Docker image pulls under interception | Docker Desktop builds a bundle from the Windows certificate store (Trusted Root + Intermediate) and appends it to Moby's trusted certs, so FROM / `COPY --from=ghcr.io/...` pulls trust the Avast root already installed in the Windows store `[CITED: docs.docker.com Docker Desktop for Windows FAQ, "How do I add custom CA certificates?"]` |
| RUN steps inside builds | Do not inherit host trust; `npm ci` and `uv sync` need the CA supplied explicitly `[CITED: docs.docker.com, "Containers ... don't inherit"; engine/network/ca-certs]` |
| Base images ship `ca-certificates` | `python:3.12-slim` installs `ca-certificates netbase tzdata`; `node` slim installs `ca-certificates` `[CITED: docker-library/python slim Dockerfile; nodejs/docker-node trixie-slim Dockerfile]`, so `/etc/ssl/certs/ca-certificates.crt` is expected in both (still confirm in the probe) |

### Recommended pattern: optional BuildKit secret, build stages only

- `RUN --mount=type=secret,id=extra_ca` mounts the file at `/run/secrets/extra_ca` for that RUN only and never bakes it into a layer; `required` defaults to `false`, so a build without `--secret` simply has no file `[CITED: docs.docker.com / moby buildkit Dockerfile reference, "RUN --mount=type=secret"]`.
- Node: `NODE_EXTRA_CA_CERTS` is additive to Node's bundled roots, so point it at the secret directly (npm is a Node process; the env var is set before it starts).
- uv: `SSL_CERT_FILE` replaces the default roots, so first concatenate `/etc/ssl/certs/ca-certificates.crt` + the secret into a temp bundle, export `SSL_CERT_FILE`, run `uv sync`, delete the bundle in the same RUN (a file created and removed inside one RUN is not in the layer diff). The Python build stage is not the final stage, so nothing can leak into the shipped image either way.
- Pass the secret only when the probe fails: `docker build --secret id=extra_ca,src="C:\ProgramData\Avast Software\Avast\wscert.pem" -t finally .` (PowerShell). Passing it when interception is off is harmless and is a cheap way to prove the mount mechanism.

### Probe (run once Docker Desktop is up; read-only, verification stays on)

```bash
docker run --rm node:24-slim node -e "fetch('https://registry.npmjs.org/next/latest').then(r=>console.log('node',r.status)).catch(e=>{console.log('node FAIL',e.cause&&e.cause.code);process.exit(1)})"
docker run --rm python:3.12-slim python -c "import urllib.request as u;print('py',u.urlopen('https://pypi.org/simple/six/',timeout=15).status)"
docker run --rm python:3.12-slim ls -l /etc/ssl/certs/ca-certificates.crt
```
Decision tree: both print 200 -> no interception inside Docker; build without `--secret` (keep the optional mount in the Dockerfile, it is a no-op). `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` / `SELF_SIGNED_CERT_IN_CHAIN` / `CERTIFICATE_VERIFY_FAILED` -> interception active; rebuild with the secret. Still failing with the secret -> inspect the chain from inside a container (`openssl s_client`) and confirm the issuer matches the PEM; do not disable verification.

### Draft Dockerfile (UNTESTED: Docker daemon not running; syntax follows the verified docs and the uv Docker guide)

```dockerfile
# syntax=docker/dockerfile:1

FROM node:24-slim AS frontend
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=secret,id=extra_ca \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS backend-build
COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /bin/uv
ENV UV_PYTHON_DOWNLOADS=0 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=secret,id=extra_ca \
    if [ -s /run/secrets/extra_ca ]; then \
        cat /etc/ssl/certs/ca-certificates.crt /run/secrets/extra_ca > /tmp/ca.pem; \
        export SSL_CERT_FILE=/tmp/ca.pem; \
    fi; \
    uv sync --locked; \
    rm -f /tmp/ca.pem

FROM python:3.12-slim
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 DB_PATH=/app/db/finally.db
COPY --from=backend-build /app/.venv /app/.venv
COPY backend/app /app/app
COPY --from=frontend /fe/out /app/static
RUN mkdir -p /app/db
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"
CMD ["uvicorn", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--timeout-graceful-shutdown", "3"]
```
Notes: virtual project, so a single `uv sync --locked` over `pyproject.toml` + `uv.lock` is enough and still cache-friendly (app code is copied later); extras (`dev`) are not installed by default; same `/app` path and same Python image in builder and runtime so venv shebangs and the interpreter symlink resolve; run as root in Phase 1 (volume ownership is a Phase 6 concern); `--host 0.0.0.0` is required for the published port. Optional speedup: add `--mount=type=cache,target=/root/.cache/uv` to the uv RUN.

`.dockerignore` (build context is the repo root):
```
.git
.github
.claude
.planning
planning
.env
.env.*
!.env.example
**/.venv
**/__pycache__
**/node_modules
frontend/.next
frontend/out
backend/static
backend/tests
test
db
*.md
```

### Verification commands for PKG-01 (after Docker Desktop is running)
```bash
docker build --progress=plain -t finally:skeleton .                 # TLS verification on; add --secret only if the probe failed
docker run -d --name finally-skel -p 8000:8000 finally:skeleton
curl -fsS http://localhost:8000/api/health                          # {"status":"ok"}
curl -fsS http://localhost:8000/ | grep -c app-title                # >= 1
docker top finally-skel | wc -l                                     # 2 = header + one uvicorn process (one worker)
docker inspect -f '{{json .Config.Cmd}}' finally:skeleton           # contains "--workers","1"
docker inspect -f '{{.State.Health.Status}}' finally-skel           # healthy (after start period)
docker history --no-trunc finally:skeleton | grep -ci avast         # 0: cert not baked
cd test && BASE_URL=http://localhost:8000 npx playwright test       # host smoke
docker rm -f finally-skel
```

## Contract doc (FND-04): outline and conflicts to resolve

File: `planning/API_CONTRACT.md`, referenced from `CLAUDE.md`, the backend (`app/main.py` docstring) and the frontend (a `frontend/src/lib/types.ts` doc comment when it is created). Phase 1 should write the doc only; Pydantic response models and TS types arrive with the first real routes (Phases 2-3) to avoid dead code.

### Conflicts found between `planning/MARKET_INTERFACE.md` and PROJECT.md decisions (all verified by reading both)

| # | MARKET_INTERFACE.md (and MARKET_SIMULATOR.md) says | PROJECT.md / REQUIREMENTS / ROADMAP say | Recommended reconciliation |
|---|----------------------------------------------------|------------------------------------------|----------------------------|
| 1 | `to_dict()` emits `"day_change_percent"` (12 occurrences of `day_change_percent`/`reference_price` in the file; also `MARKET_SIMULATOR.md:162-163`) | Decision 3 / MKT-09: field `change_percent` | Use `change_percent` everywhere; edit both market docs |
| 2 | `reference_price` = previous close for Massive, first-seen price for simulator ("true daily change" for Massive) | Decision 2: change since the seed/session-start price, "not tick-over-tick, not daily"; MKT-07 caches a "session-start price" | Rename to `session_start_price` (first price cached since process start) for BOTH sources; drop the Massive `prev_day.close` reference and the `reference_price=` argument in `_fetch_snapshot` |
| 3 | `change` = tick-over-tick (`price - previous_price`), `direction` tick-over-tick | Decision 3 lists `change` without a definition | Keep `change` and `direction` tick-over-tick (they drive the flash). State loudly in the contract that `change_percent` is session-start-based, so `change` and `change_percent` are NOT the same quantity. Confirm with the user (see Open Questions) |
| 4 | SSE implemented by hand with `StreamingResponse`, `retry: 1000`, 500 ms polling | STACK.md: native `EventSourceResponse` (auto `: ping` every 15 s) | Contract specifies wire format only: `data: <json>` frames, one per cache-version change, no `event:` name; `retry: 1000` may be sent via `ServerSentEvent(retry=1000)` (the model has a `retry` integer field `[VERIFIED: fastapi/sse.py _SSE_EVENT_SCHEMA]`); implementation is Phase 2 |
| 5 | Module-level `price_cache`/`market_source` (section 11) | PITFALLS #5: build in lifespan | Add a note in the market doc: superseded by `create_app()` + lifespan |
| 6 | Massive polling "5s/15m" (section 8) vs "2-15s" in PLAN | Decision 16: 2-15s, 5s default | Not a Phase 1 doc fix; leave for Phase 2 |

### Proposed contract (decisions to freeze; planner may adjust, but every item needs a written answer)

**Conventions:** all bodies JSON; success is 200 (no 201); errors are `{"error": "<message>"}`; prices rounded to 2 dp, quantities to 6 dp, `change` and `change_percent` to 4 dp; SSE `timestamp` is epoch seconds (float); REST timestamps (`recorded_at`, `executed_at`, `created_at`) are ISO-8601 UTC strings. Status codes: 200 success; 400 validation or domain failure (including FastAPI body validation, remapped from 422); 404 unknown watchlist ticker on DELETE and any unknown `/api/*` path; 500 `{"error": "Internal server error"}` for unexpected failures. Unknown path with another method also yields 404 (catch-all). Chat/LLM failure is NOT an HTTP error: 200 with a graceful assistant message and no actions.

| Endpoint | Request | Success response | Errors |
|----------|---------|------------------|--------|
| `GET /api/health` | -- | 200 `{"status": "ok"}` (extra keys allowed later, e.g. `feed_age_s`) | none; port is closed until startup completes |
| `GET /api/stream/prices` | -- | `text/event-stream`; frame `data: {"AAPL": PriceUpdate, ...}` per cache-version change over ALL tracked tickers (watchlist U positions); `: ping` comments ~15 s; client must not derive the watchlist from the keys | -- |
| `GET /api/watchlist` | -- | 200 `{"watchlist": [PriceUpdate-or-null-price, ...]}` (price fields null until priced) | -- |
| `POST /api/watchlist` | `{"ticker": "PYPL"}` | 200 `{"watchlist": [...]}`; re-adding an existing ticker is an idempotent 200 | 400 `{"error": "Invalid ticker: ..."}` (format `[A-Z][A-Z.]{0,9}` after upper-casing), 400 `{"error": "Unknown ticker"}` |
| `DELETE /api/watchlist/{ticker}` | -- | 200 `{"watchlist": [...]}`; a held ticker keeps streaming | 404 `{"error": "Ticker not in watchlist"}` |
| `GET /api/portfolio` | -- | 200 `Portfolio` | -- |
| `POST /api/portfolio/trade` | `{"ticker": "AAPL", "quantity": 1.5, "side": "buy"}` (`side` is `"buy"` or `"sell"`, `quantity` > 0) | 200 `{"trade": Trade, "portfolio": Portfolio}` | 400 `{"error": "..."}` for quantity <= 0, no price, insufficient cash, insufficient shares, bad side |
| `GET /api/portfolio/history` | -- | 200 `{"history": [{"total_value": 10000.0, "recorded_at": "..."}]}` ascending, most recent 2000 max; server may record a snapshot first (min-interval guarded) | -- |
| `POST /api/chat` | `{"message": "..."}` | 200 `{"message": str, "actions": [Action], "portfolio": Portfolio, "watchlist": [...]}` | 400 `{"error": ...}` for an empty message only |
| `GET /api/chat/history` | -- | 200 `{"messages": [{"id": str, "role": "user"\|"assistant", "content": str, "actions": [Action] \| null, "created_at": "..."}]}` oldest first, most recent 100 | -- |

Shared shapes:
- `PriceUpdate`: `{"ticker", "price", "previous_price", "timestamp", "change", "change_percent", "direction"}` where `direction` is `"up" | "down" | "flat"` (versus previous tick) and `change_percent = round((price / session_start_price - 1) * 100, 4)`.
- `Portfolio`: `{"cash", "total_value", "unrealized_pnl", "positions": [{"ticker", "quantity", "avg_cost", "current_price", "market_value", "unrealized_pnl", "pnl_percent"}]}`. Name the per-position percentage `pnl_percent` (vs `avg_cost`), distinct from the SSE `change_percent`.
- `Trade`: `{"id", "ticker", "side", "quantity", "price", "executed_at"}`.
- `Action` (chat, per-action outcome, server-authoritative): `{"type": "trade", "ticker", "side", "quantity", "price": number|null, "ok": bool, "error": str|null}` or `{"type": "watchlist", "ticker", "action": "add"|"remove", "ok": bool, "error": str|null}`.
- Mock LLM keyword table (freeze now because E2E depends on it; PITFALLS #19): message containing "buy" -> buy 1 AAPL; "sell" -> sell 1 AAPL; "add <TICKER>" / "remove <TICKER>" -> watchlist change; "broke" -> an unaffordable buy (failure path); "malformed" -> non-JSON text (error path); anything else -> message only.

## Code Examples

### Backend tests (run, 3 passed; use these as the Phase 1 test files)
```python
# backend/tests/test_health.py
from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_settings(tmp_path: Path) -> Settings:
    return replace(Settings.from_env(), db_path=tmp_path / "t.db", static_dir=tmp_path / "static")


def test_health_ok(tmp_path):
    with TestClient(create_app(make_settings(tmp_path))) as client:
        r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_unknown_api_path_is_json_404_even_with_static_dir(tmp_path):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<h1>home</h1>")
    (static / "404.html").write_text("<h1>nf</h1>")
    with TestClient(create_app(make_settings(tmp_path))) as client:
        assert client.get("/").text == "<h1>home</h1>"
        r = client.get("/api/nope")
    assert r.status_code == 404 and r.json() == {"error": "Not found"}
```
```python
# backend/tests/test_config.py   (delenv every variable under test: this shell presets LLM_MOCK)
import pytest

from app import config


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ("OPENROUTER_API_KEY", "MASSIVE_API_KEY", "LLM_MOCK", "DB_PATH", "SIM_SEED",
                 "SIM_EVENT_PROBABILITY", "STATIC_DIR"):
        monkeypatch.delenv(name, raising=False)


def test_defaults(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "ROOT_DIR", tmp_path)
    s = config.Settings.from_env()
    assert s.db_path == tmp_path / "db" / "finally.db" and not s.llm_mock and s.sim_seed is None


def test_root_dotenv_is_loaded_and_real_env_wins(monkeypatch, tmp_path):
    (tmp_path / ".env").write_text("SIM_SEED=7\nSIM_EVENT_PROBABILITY=0.5\nLLM_MOCK=true\n")
    monkeypatch.setattr(config, "ROOT_DIR", tmp_path)
    monkeypatch.setenv("SIM_EVENT_PROBABILITY", "0.0")        # real env beats .env
    s = config.Settings.from_env()
    assert s.sim_seed == 7 and s.llm_mock and s.sim_event_probability == 0.0
```
Caution: `load_dotenv` writes into `os.environ`; `monkeypatch.delenv(..., raising=False)` in the fixture registers cleanup so values loaded by one test do not leak into the next.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `starlette.testclient` on `httpx` | `httpx2` (Starlette 1.7.0 deprecation warning) | Dev extra uses `httpx2` |
| `sse-starlette` / hand-rolled SSE | `fastapi.sse.EventSourceResponse` | Phase 2; contract is wire-format only |
| `create-next-app` with Cache Components | Hand-written static export | Fewer surprises |
| Tailwind v3 `tailwind.config.js` | v4 CSS-first `@theme` + `@tailwindcss/postcss` | Verified |
| `@app.on_event("startup")` | `lifespan=` | Used above |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Avast interception is toggled/intermittent (off today) and, when on, may or may not affect traffic from the Docker WSL2 VM | Docker | If Docker-side interception exists, the probe will show it; the secret pattern covers it. No plan impact |
| A2 | `python:3.12-slim` contains `/etc/ssl/certs/ca-certificates.crt` (inferred from the base Dockerfile installing `ca-certificates`) | Docker | If missing, the `cat` in the uv RUN fails; the probe's `ls -l` check catches it before the build |
| A3 | A file created and deleted within one RUN is absent from the resulting layer, and secret mounts are not persisted | Docker | Final-stage separation makes this moot for Python; Node stage never copies `/fe` except `out/`. `docker history | grep -ci avast` is the check |
| A4 | `uv.lock` produced on Windows works with `uv sync --locked` on Linux (uv locks are universal) | Docker | Build fails loudly at `--locked`; fix by re-locking. Not exercised (no daemon) |
| A5 | `httpx2` works with Starlette 1.7.0 `TestClient` and exposes `ASGITransport` | Stack | Not verified (install blocked). Fallback to `httpx` + filterwarnings is verified |
| A6 | Making `change` tick-over-tick while `change_percent` is session-based is what the user wants | Contract | Frontend would show inconsistent pair; cheap to change in the doc now, expensive after Phase 2 |
| A7 | One idempotent 200 for re-adding a watchlist ticker (vs 409) and `{"watchlist": [...]}` wrappers are acceptable | Contract | Contract-only decision; change before Phase 3 |
| A8 | The Docker build should keep the optional CA secret mount even when interception is off | Docker | Slight extra Dockerfile lines; alternative is adding it only after a failure |

## Open Questions (RESOLVED)

1. **Skeleton template asks for "one real DB read AND write"; the roadmap puts DB in Phase 2.** RESOLVED by CONTEXT D-03: SQLite deferred to Phase 2; the skeleton proves browser -> static page -> same-origin `/api/health`; recorded in `01-SKELETON.md`.
   - What we know: DB-01..03 and the seed are Phase 2 requirements; Phase 1 requirements contain no persistence.
2. **`change` semantics (tick vs session) and Massive's session-start definition** (Contract conflicts 2-3). RESOLVED by CONTEXT D-01: `change` and `direction` stay tick-over-tick; `change_percent` is measured from `session_start_price` (first price cached since process start, simulator and Massive alike); `session_start_price` is an SSE field. Implemented in plan 01-02.
3. **`httpx2` vs `httpx`.** RESOLVED by CONTEXT D-02: plain `httpx` with a pytest warnings filter; `httpx2` is not installed. Implemented in plan 01-03.
4. **Does Avast intercept inside the Docker VM?** RESOLVED at execution time by design (CONTEXT D-04): plan 01-05 Task 2 runs the TLS probe before the build and takes the planned branch (no secret, or the optional BuildKit CA secret in throwaway stages); verification stays on either way.
5. **Should `types.ts` / `schemas.py` be created in Phase 1?** RESOLVED (planner, following this recommendation): no contract-wide types in Phase 1; only the typed `getHealth()` in `frontend/src/lib/api.ts` for the one real route. Pydantic models and TS types arrive with their routes in Phases 2-5.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker CLI | PKG-01 | yes | 29.7.2 (buildx 0.36.1, compose bundled) | -- |
| Docker daemon (Docker Desktop, WSL2) | PKG-01 build/run | **no (not running)** | installed at `C:\Program Files\DockerDesktop` | none: human must start it |
| Node.js / npm | FND-03, Playwright | yes | v26.8.1 / 11.19.0 (Docker build uses `node:24-slim`) | -- |
| uv | FND-02 | yes | 0.12.17 | -- |
| Python | FND-02 | yes | 3.12.14 | -- |
| Playwright 1.63.0 + Chromium | PKG-01 smoke | yes | in `test/node_modules`; Chromium 153 launched headless | Playwright container (not needed) |
| Avast root PEM | Docker CA secret | yes | `C:\ProgramData\Avast Software\Avast\wscert.pem` | export from Windows store (PowerShell `Export-Certificate` + `certutil -encode`) |
| git, curl, openssl (Git Bash) | hygiene, probes | yes | -- | -- |
| Port 8000 | run | free | no listener | any free port with `-p`/`BASE_URL` |

**Missing dependencies with no fallback:** a running Docker daemon (PKG-01 cannot pass without it).
**Facts that change earlier assumptions:** `pytest.exe` and `uvicorn.exe` launchers ran fine here (memory note about App Control not reproduced); keep `uv run python -m pytest` regardless.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend | pytest 9.1.1 via `uv run python -m pytest` (config in `backend/pyproject.toml`, to be created in Wave 0) |
| Frontend | none in Phase 1 (build + type-check is the check; Vitest arrives in Phase 2+) |
| E2E smoke | @playwright/test 1.63.0 on the host (`test/`) |
| Quick run | `cd backend && uv run python -m pytest -q` |
| Full suite | quick run + `cd frontend && npm run build` + Docker verification block + `cd test && BASE_URL=http://localhost:8000 npx playwright test` |

### Phase Requirements -> Test Map
| Req | Behavior | Type | Automated Command | File Exists? |
|-----|----------|------|-------------------|-------------|
| FND-01 | Artifacts untracked and ignored; LF attrs; source dirs not ignored | shell | `test -z "$(git ls-files backend/static test/node_modules test/playwright-report test/test-results)" && git check-ignore -q backend/static/x && git check-ignore -q test/node_modules/x && ! git check-ignore -q frontend/src/lib/api.ts && git check-attr eol -- scripts/start_mac.sh Dockerfile .env.example \| grep -c "eol: lf"` (expect 3) | Wave 0 (no file; commands) |
| FND-02 | Backend tests pass, factory app works | unit | `cd backend && uv run python -m pytest -q` | Wave 0: `tests/test_health.py` |
| FND-03 | Static export of Tailwind dark page | build | `cd frontend && npm ci && npm run build && test -f out/index.html && grep -rlq "0d1117" out/_next/static && grep -q app-title out/index.html` | Wave 0 |
| FND-04 | Contract doc complete, one naming | grep | `for p in /api/health /api/stream/prices /api/watchlist /api/portfolio /api/portfolio/trade /api/portfolio/history /api/chat /api/chat/history change_percent session_start_price; do grep -q "$p" planning/API_CONTRACT.md \|\| echo MISSING $p; done; ! grep -rn "day_change_percent\|reference_price" planning backend/app frontend/src` | Wave 0: the doc |
| FND-05 | Env vars and root `.env` honored; real env wins | unit | `cd backend && uv run python -m pytest -q tests/test_config.py` and manual: `SIM_SEED=7 DB_PATH=/tmp/x.db uv run uvicorn --factory app.main:create_app` then `curl -s localhost:8000/api/health` | Wave 0: `tests/test_config.py` |
| FND-06 | Status lines true | grep | `! grep -n -i -E "market_data_demo\|MARKET_DATA_SUMMARY\|planning/archive\|^- \*\*Done" README.md CLAUDE.md` and `grep -c "python -m pytest" README.md` (>= 1) | Wave 0 |
| PORT-08 | Health 200 | unit + live | `uv run python -m pytest -q tests/test_health.py::test_health_ok`; `curl -fsS localhost:8000/api/health` | Wave 0 |
| PKG-01 | Build with verification on; one worker; page + health served | docker | verification block in the Docker section (`docker build`, `docker run`, `curl`, `docker top`, `docker history`) | Wave 0: `Dockerfile`, `.dockerignore` |
| SC4 smoke | Host Playwright loads page and sees API ok | e2e | `cd test && BASE_URL=http://localhost:8000 npx playwright test` | Wave 0: `playwright.config.ts`, `smoke.spec.ts` |

### Sampling Rate
- **Per task commit:** the single command for the touched area (pytest, `npm run build`, or the grep/git checks).
- **Per wave merge:** backend pytest + frontend build + FND-01/04/06 shell checks.
- **Phase gate:** full suite incl. Docker block and Playwright smoke green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `backend/pyproject.toml`, `uv.lock`, `app/`, `tests/` (3 test files above)
- [ ] `frontend/` scaffold (package.json, lockfile, next/postcss/tsconfig, `src/app/*`)
- [ ] `test/package.json` + lockfile + Playwright config + smoke spec
- [ ] `Dockerfile`, `.dockerignore`, `.env.example`, `.gitattributes`, `db/.gitkeep`, `planning/API_CONTRACT.md`
- [ ] Docker Desktop started (human action) before any PKG-01 task

## Security Domain

`security_enforcement: true`, ASVS level 1 (`.planning/config.json`).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication / V3 Session / V4 Access Control | no | Single hardcoded user by design (Out of Scope) |
| V5 Input Validation | yes (skeleton level) | FastAPI/Pydantic validation remapped to 400 `{"error"}`; static path traversal handled by Starlette `StaticFiles` |
| V6 Cryptography | no | No crypto in Phase 1. TLS verification stays on everywhere |
| V10 Malicious code / supply chain | yes | Committed lockfiles, `uv sync --locked`, `npm ci`, pinned base images/uv tag, batched human-verify for SUS packages |
| V14 Configuration | yes | Secrets only via gitignored `.env`; `.env` excluded by `.dockerignore`; cert supplied by build secret, never baked; no `ENV` secrets |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret leaks into image/context (`COPY .` with `.env`) | Information disclosure | `.dockerignore` excludes `.env`, `.git`, `.planning`; verify with `docker history`/`docker run ... ls` |
| MITM root baked into a shipped image | Spoofing / Elevation | Secret mount in throwaway stages only; `docker history | grep -ci avast` must be 0 |
| Disabling TLS verification to get a build through | Tampering | Forbidden; only `NODE_EXTRA_CA_CERTS` / combined `SSL_CERT_FILE` |
| Malicious/compromised dependency release | Tampering | Lockfiles; legitimacy gate; (LiteLLM 1.82.7/1.82.8 pin matters in Phase 5) |
| Verbose errors leaking internals | Information disclosure | Uniform `{"error": ...}`; 500 handler returns a generic message |
| Stale static files served | Tampering | Delete local `backend/static`; `.dockerignore` excludes it |

## Suggested plan slicing (for the planner; Claude's discretion)

| Wave | Plan | Reqs | Notes |
|------|------|------|-------|
| 1 | P1 Repo hygiene: `.gitignore`/`.gitattributes`/untrack/`.env.example`/`db/.gitkeep`/README+CLAUDE.md | FND-01, FND-06 | Must finish before W2 so build output is never staged |
| 1 | P2 Contract doc + market-doc reconciliation (`MARKET_INTERFACE.md`, `MARKET_SIMULATOR.md`) | FND-04 | Docs only, parallel with P1 |
| 2 | P3 Backend skeleton + tests | FND-02, FND-05, PORT-08 | After batched human-verify for Python packages |
| 2 | P4 Frontend skeleton + build | FND-03 | After human-verify for npm packages; commit Next-rewritten tsconfig |
| 3 | P5 Docker + Playwright smoke | PKG-01 | Opens with human checkpoint: start Docker Desktop; then TLS probe; then build; then smoke; record "host Playwright works, no container" decision in SKELETON.md / PROJECT.md key decisions |

SKELETON.md content hints: capability = "a developer runs the app locally and in Docker and the browser shows a dark Tailwind page that confirms the API answered"; decisions = FastAPI app factory + `--factory`, uv virtual project, Next 16.4 static export, same-origin single port, host Playwright, SQLite deferred to Phase 2, 3-stage Dockerfile with optional CA secret; out of scope = DB, market, SSE implementation, charts, LLM, compose/scripts (Phase 6).

## Sources

### Primary (HIGH confidence)
- Scratch builds and runs in this session (backend pytest + uvicorn + static + errors; Next 16.4.0 export + dev proxy; Playwright runner against FastAPI-served export; lifespan-before-listen experiment)
- Context7 `/astral-sh/uv` (SSL_CERT_FILE replaces default roots; `UV_SYSTEM_CERTS`), `/docker/docs` (secret mounts, `required` default false, Docker Desktop Windows cert bundle behavior, CA in Dockerfile), `/websites/tailwindcss` (gitignored paths excluded from detection)
- `git ls-files`, `git check-ignore -v`, `git config`, `docker version`, `openssl`, `Get-ChildItem Cert:`, `npm view`, `gsd-tools package-legitimacy check`, registry manifest requests (all run this session)
- Installed package sources read in scratch: `starlette/testclient.py`, `fastapi/sse.py`
- Project files: `.planning/{REQUIREMENTS,ROADMAP,STATE,PROJECT}.md`, `.planning/research/*`, `planning/PLAN.md`, `planning/MARKET_INTERFACE.md`, `planning/MARKET_SIMULATOR.md`

### Secondary (MEDIUM confidence)
- docker-library/python slim Dockerfile and nodejs/docker-node trixie-slim Dockerfile (ca-certificates installed)
- Docker forum threads on x509 errors behind SSL-inspecting proxies / Avast HTTPS scanning

### Tertiary (LOW confidence)
- Behavior of Avast scanning for traffic from the Docker WSL2 VM (unverified; probe resolves it)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, versions from registries and a working scratch build/lock
- Architecture: HIGH, every snippet except the Dockerfile was executed
- Docker/TLS: LOW-MEDIUM, patterns cited from official docs, but nothing could be executed (daemon down)
- Contract doc: MEDIUM, a proposal built from the project's own decisions; items A6-A7 need confirmation
- Pitfalls: HIGH, most reproduced locally

**Research date:** 2026-10-06
**Valid until:** 2026-10-13 (Next 16.4.0 was published today; fast-moving)
