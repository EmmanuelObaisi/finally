"""PORT-07: GET /api/portfolio/history and its guarded request-time snapshot."""
import re


def test_fresh_database_returns_the_seeded_point(client):
    """A new database holds exactly the seeded point, and repeat requests do not grow it."""
    response = client.get("/api/portfolio/history")
    assert response.status_code == 200
    history = response.json()["history"]
    assert len(history) == 1
    assert history[0]["total_value"] == 10000.0
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", history[0]["recorded_at"])
    assert client.get("/api/portfolio/history").json() == response.json()
