from dataclasses import replace
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.config import Settings
from app.main import create_app


def make_settings(tmp_path: Path) -> Settings:
    return replace(Settings.from_env(), db_path=tmp_path / "t.db", static_dir=tmp_path / "static")


class Probe(BaseModel):
    a: int


def test_unknown_api_path_is_json_404_even_with_static_dir(tmp_path):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<h1>home</h1>")
    (static / "404.html").write_text("<h1>nf</h1>")
    with TestClient(create_app(make_settings(tmp_path))) as client:
        assert client.get("/").text == "<h1>home</h1>"
        r = client.get("/api/nope")
    assert r.status_code == 404 and r.json() == {"error": "Not found"}


def test_validation_failure_is_400_with_error_envelope(tmp_path):
    app = create_app(make_settings(tmp_path))

    @app.post("/probe")
    def probe(body: Probe) -> dict:
        return {"a": body.a}

    with TestClient(app) as client:
        r = client.post("/probe", json={"a": "not-an-int"})
    assert r.status_code == 400
    assert list(r.json()) == ["error"] and r.json()["error"].startswith("a: ")


def test_unhandled_exception_is_generic_500(tmp_path):
    app = create_app(make_settings(tmp_path))

    @app.get("/boom")
    def boom() -> dict:
        raise RuntimeError("secret detail")

    with TestClient(app, raise_server_exceptions=False) as client:
        r = client.get("/boom")
    assert r.status_code == 500
    assert r.headers["content-type"].startswith("application/json")
    assert r.json() == {"error": "Internal server error"}
    assert "secret detail" not in r.text
