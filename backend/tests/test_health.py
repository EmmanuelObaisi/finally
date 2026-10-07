from fastapi.testclient import TestClient

from app.main import create_app


def test_health_ok(settings):
    with TestClient(create_app(settings)) as client:
        r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_health_is_side_effect_free(settings):
    with TestClient(create_app(settings)) as client:
        first = client.get("/api/health")
        second = client.get("/api/health")
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json() == {"status": "ok"}


def test_static_export_served_when_present(settings):
    static = settings.static_dir
    static.mkdir()
    (static / "index.html").write_text("<h1>home</h1>")
    with TestClient(create_app(settings)) as client:
        r = client.get("/")
    assert r.status_code == 200 and r.text == "<h1>home</h1>"
