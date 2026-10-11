# Owner login

FinAlly now requires login by default. `AUTH_USERNAME` and `AUTH_PASSWORD` are
runtime environment variables. The local `.env` has been configured with an
owner username and a generated password. Read those two fields in your editor to
sign in, or replace the password with your own strong password (16+ characters).
Restart with `docker compose up -d` after changing credentials.

The API and SSE endpoint require an HttpOnly, SameSite=Strict session cookie.
Sessions expire after 12 hours and are stored as token hashes in the existing
SQLite database. Sign-out revokes the token. Credential changes invalidate all
existing sessions. Failed sign-ins are limited to 10 per five minutes across the
single-owner app. Cross-origin mutation requests are rejected. `/api/health`
remains public for Docker and Fly health checks. Static files contain no account
data; portfolio hooks only mount after session verification.

Missing credentials leave the app locked. `AUTH_DISABLED=true` is an explicit
local demo/test option. Fly sets it false and sets `AUTH_COOKIE_SECURE=true` for
HTTPS-only cookies. The deploy script imports owner credentials as Fly secrets.
No registration, password reset, or separate user portfolios are provided.
