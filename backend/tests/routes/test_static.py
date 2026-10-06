"""Tests for SPA static file serving."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import SPAStaticFiles


def make_client(tmp_path) -> TestClient:
    (tmp_path / "index.html").write_text("<html>home</html>")
    (tmp_path / "_next").mkdir()
    (tmp_path / "_next" / "app.js").write_text("console.log(1)")
    app = FastAPI()

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    app.mount("/", SPAStaticFiles(directory=tmp_path), name="static")
    return TestClient(app)


def test_serves_index_and_assets(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/").text == "<html>home</html>"
    assert client.get("/_next/app.js").text == "console.log(1)"


def test_unknown_path_falls_back_to_index(tmp_path):
    response = make_client(tmp_path).get("/some/page")
    assert response.status_code == 200
    assert response.text == "<html>home</html>"


def test_api_routes_are_not_shadowed(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/missing").status_code == 404
