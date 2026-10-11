import hashlib
import time

import pytest
from fastapi.testclient import TestClient

from app.auth import _connection
from app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "false")
    monkeypatch.setenv("AUTH_USERNAME", "owner")
    monkeypatch.setenv("AUTH_PASSWORD", "a-long-test-password")
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.delenv("MASSIVE_API_KEY", raising=False)
    with TestClient(create_app()) as test_client:
        yield test_client


def sign_in(client):
    return client.post("/api/auth/login", json={"username": "owner", "password": "a-long-test-password"})


def test_protected_api_and_stream(client):
    assert client.get("/api/health").status_code == 200
    for path in ("/api/portfolio", "/api/watchlist", "/api/stream/prices", "/api/portfolio/history"):
        assert client.get(path).status_code == 401
    assert client.post("/api/chat", json={"message": "hello"}).status_code == 401
    assert client.get("/api/auth/session").json()["authenticated"] is False


def test_login_logout_revokes_cookie(client):
    wrong = client.post("/api/auth/login", json={"username": "owner", "password": "wrong"})
    assert wrong.status_code == 401
    response = sign_in(client)
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    token = client.cookies.get("finally_session")
    assert client.get("/api/portfolio").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    client.cookies.set("finally_session", token)
    assert client.get("/api/portfolio").status_code == 401


def test_expiry_and_password_rotation(client, monkeypatch):
    sign_in(client)
    with _connection() as conn:
        conn.execute("UPDATE auth_sessions SET expires = ?", (time.time() - 1,))
    assert client.get("/api/portfolio").status_code == 401
    sign_in(client)
    monkeypatch.setenv("AUTH_PASSWORD", "new-password-invalidates-sessions")
    assert client.get("/api/portfolio").status_code == 401


def test_cross_site_and_rate_limit(client):
    assert client.post("/api/auth/login", headers={"Origin": "https://evil.example"}, json={"username": "owner", "password": "a-long-test-password"}).status_code == 403
    for _ in range(10):
        assert client.post("/api/auth/login", json={"username": "owner", "password": "wrong"}).status_code == 401
    assert sign_in(client).status_code == 429


def test_secure_cookie_and_hashed_token(client, monkeypatch):
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    response = sign_in(client)
    assert "Secure" in response.headers["set-cookie"]
    with _connection() as conn:
        row = conn.execute("SELECT token_hash FROM auth_sessions").fetchone()
    assert row[0] == hashlib.sha256(client.cookies.get("finally_session").encode()).hexdigest()


def test_unconfigured_fails_closed(client, monkeypatch):
    monkeypatch.delenv("AUTH_PASSWORD")
    assert sign_in(client).status_code == 503
    assert client.get("/api/portfolio").status_code == 401
