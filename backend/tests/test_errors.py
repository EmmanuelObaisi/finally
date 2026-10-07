import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.main import create_app


class Probe(BaseModel):
    a: int


def test_unknown_api_path_is_json_404_even_with_static_dir(settings):
    static = settings.static_dir
    static.mkdir()
    (static / "index.html").write_text("<h1>home</h1>")
    (static / "404.html").write_text("<h1>nf</h1>")
    with TestClient(create_app(settings)) as client:
        assert client.get("/").text == "<h1>home</h1>"
        r = client.get("/api/nope")
    assert r.status_code == 404 and r.json() == {"error": "Not found"}


METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "PROPFIND"]


@pytest.mark.parametrize("with_static", [True, False])
@pytest.mark.parametrize("method", METHODS)
def test_any_method_on_unknown_api_path_is_json_404(settings, method, with_static):
    if with_static:
        settings.static_dir.mkdir()
        (settings.static_dir / "index.html").write_text("<h1>home</h1>")
        (settings.static_dir / "404.html").write_text("<h1>nf</h1>")
    with TestClient(create_app(settings)) as client:
        r = client.request(method, "/api/nope")
    assert r.status_code == 404
    if method != "HEAD":
        assert r.json() == {"error": "Not found"}


def test_validation_failure_is_400_with_error_envelope(settings):
    app = create_app(settings)

    @app.post("/probe")
    def probe(body: Probe) -> dict:
        return {"a": body.a}

    with TestClient(app) as client:
        r = client.post("/probe", json={"a": "not-an-int"})
    assert r.status_code == 400
    assert list(r.json()) == ["error"] and r.json()["error"].startswith("a: ")


def test_unhandled_exception_is_generic_500(settings):
    app = create_app(settings)

    @app.get("/boom")
    def boom() -> dict:
        raise RuntimeError("secret detail")

    with TestClient(app, raise_server_exceptions=False) as client:
        r = client.get("/boom")
    assert r.status_code == 500
    assert r.headers["content-type"].startswith("application/json")
    assert r.json() == {"error": "Internal server error"}
    assert "secret detail" not in r.text
