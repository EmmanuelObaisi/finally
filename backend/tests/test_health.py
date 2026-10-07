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


def test_health_is_side_effect_free(tmp_path):
    with TestClient(create_app(make_settings(tmp_path))) as client:
        first = client.get("/api/health")
        second = client.get("/api/health")
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"status": "ok"}


def test_static_export_served_when_present(tmp_path):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<h1>home</h1>")
    with TestClient(create_app(make_settings(tmp_path))) as client:
        r = client.get("/")
    assert r.status_code == 200 and r.text == "<h1>home</h1>"
