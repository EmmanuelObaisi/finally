"""Single-owner authentication with revocable, persistent opaque sessions."""

import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

from .db import get_connection

COOKIE = "finally_session"
SESSION_SECONDS = 12 * 60 * 60


def disabled() -> bool:
    return os.getenv("AUTH_DISABLED", "false").lower() == "true"


def configured() -> bool:
    return bool(os.getenv("AUTH_USERNAME", "").strip() and os.getenv("AUTH_PASSWORD", ""))


def _connection():
    conn = get_connection()
    conn.execute("CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, expires REAL NOT NULL, credential_hash TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS auth_failures (attempted REAL NOT NULL)")
    return conn


def _credential_hash() -> str:
    return hashlib.sha256((os.getenv("AUTH_USERNAME", "") + "\0" + os.getenv("AUTH_PASSWORD", "")).encode()).hexdigest()


def authenticated(token: str | None) -> bool:
    if not token or not configured():
        return False
    with _connection() as conn:
        row = conn.execute("SELECT expires, credential_hash FROM auth_sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    return bool(row and row["expires"] > time.time() and hmac.compare_digest(row["credential_hash"], _credential_hash()))


class AuthMiddleware:
    """Pure ASGI middleware so price streams are not buffered."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/api/") and not disabled():
            request = Request(scope)
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                origin = request.headers.get("origin")
                if request.headers.get("sec-fetch-site") == "cross-site" or (origin and urlsplit(origin).netloc != request.url.netloc):
                    await JSONResponse({"detail": "Cross-site request rejected"}, status_code=403)(scope, receive, send)
                    return
            public = {"/api/health", "/api/auth/session", "/api/auth/login", "/api/auth/logout"}
            if scope["path"] not in public and not authenticated(request.cookies.get(COOKIE)):
                await JSONResponse({"detail": "Sign in to continue"}, status_code=401)(scope, receive, send)
                return
        await self.app(scope, receive, send)


class LoginRequest(BaseModel):
    username: str = Field(max_length=200)
    password: str = Field(max_length=1024)


router = APIRouter(prefix="/api/auth")


@router.get("/session")
def session(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": disabled() or authenticated(request.cookies.get(COOKIE)), "configured": disabled() or configured()}


@router.post("/login")
def login(body: LoginRequest, response: Response):
    if not configured():
        raise HTTPException(503, "Login is not configured. Set AUTH_USERNAME and AUTH_PASSWORD on the server.")
    with _connection() as conn:
        now = time.time()
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM auth_failures WHERE attempted < ?", (now - 300,))
        conn.execute("DELETE FROM auth_sessions WHERE expires <= ?", (now,))
        failures = conn.execute("SELECT COUNT(*) FROM auth_failures").fetchone()[0]
        if failures >= 10:
            raise HTTPException(429, "Too many sign-in attempts. Try again in five minutes.")
        username_ok = hmac.compare_digest(hashlib.sha256(body.username.encode()).digest(), hashlib.sha256(os.environ["AUTH_USERNAME"].encode()).digest())
        password_ok = hmac.compare_digest(hashlib.sha256(body.password.encode()).digest(), hashlib.sha256(os.environ["AUTH_PASSWORD"].encode()).digest())
        if not (username_ok and password_ok):
            conn.execute("INSERT INTO auth_failures VALUES (?)", (now,))
            conn.commit()
            raise HTTPException(401, "Incorrect username or password.")
        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO auth_sessions VALUES (?, ?, ?)", (hashlib.sha256(token.encode()).hexdigest(), now + SESSION_SECONDS, _credential_hash()))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true", samesite="strict", path="/")
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        with _connection() as conn:
            conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="strict", secure=os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true")
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": False}
