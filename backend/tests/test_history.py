"""PORT-07: GET /api/portfolio/history and its guarded request-time snapshot."""
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from app.db import connect, init_db, now_iso, transaction
from app.history import record_if_due
from app.market.cache import PriceCache

OLD = "2020-01-01T00:00:00Z"
BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)
BUY = {"ticker": "AAPL", "quantity": 1, "side": "buy"}


def at(seconds: int) -> datetime:
    return BASE + timedelta(seconds=seconds)


def sql(db_path, statement, params=()):
    """Run one parameterized statement and return its rows."""
    with connect(db_path) as conn:
        return conn.execute(statement, params).fetchall()


def insert_snapshot(db_path, total_value, recorded_at):
    sql(db_path, "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
        "VALUES (lower(hex(randomblob(8))), 'default', ?, ?)", (total_value, recorded_at))


def history(client) -> list[dict]:
    return client.get("/api/portfolio/history").json()["history"]


def backdate_all(db_path):
    sql(db_path, "UPDATE portfolio_snapshots SET recorded_at = ?", (OLD,))


def boundary_db(settings, cash=9900.0):
    """Seed snapshot at BASE (10000.0), cash as given, one AAPL share: total 10010.0 at 110."""
    init_db(settings.db_path)
    sql(settings.db_path, "UPDATE portfolio_snapshots SET recorded_at = ?", (now_iso(BASE),))
    sql(settings.db_path, "UPDATE users_profile SET cash_balance = ?", (cash,))
    sql(settings.db_path, "INSERT INTO positions (user_id, ticker, quantity, avg_cost, updated_at) "
        "VALUES ('default', 'AAPL', 1, 100.0, ?)", (OLD,))
    cache = PriceCache()
    cache.update("AAPL", 110.0)
    return cache


def snapshot_count(db_path) -> int:
    return sql(db_path, "SELECT COUNT(*) FROM portfolio_snapshots")[0][0]


def test_fresh_database_returns_the_seeded_point(client):
    """A new database holds exactly the seeded point, and repeat requests do not grow it."""
    response = client.get("/api/portfolio/history")
    assert response.status_code == 200
    points = response.json()["history"]
    assert len(points) == 1
    assert points[0]["total_value"] == 10000.0
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", points[0]["recorded_at"])
    assert client.get("/api/portfolio/history").json() == response.json()


def test_unchanged_value_keeps_one_point_however_old_the_seed(client):
    db = client.app.state.settings.db_path
    backdate_all(db)
    assert len(history(client)) == 1
    assert len(history(client)) == 1


def test_changed_value_records_one_snapshot_then_waits_out_the_interval(client):
    db = client.app.state.settings.db_path
    client.post("/api/portfolio/trade", json=BUY)
    assert len(history(client)) == 2
    backdate_all(db)
    client.app.state.cache.update("AAPL", 110.0)
    points = history(client)
    assert len(points) == 3
    assert points[-1]["total_value"] == 10010.0
    assert len(history(client)) == 3


def test_trade_adds_exactly_one_point(client):
    before = len(history(client))
    assert client.post("/api/portfolio/trade", json=BUY).status_code == 200
    assert len(history(client)) == before + 1


def test_interval_boundary_nine_seconds_skips_ten_records(settings):
    cache = boundary_db(settings)
    with connect(settings.db_path) as conn:
        assert record_if_due(conn, cache, at(9)) is False
        assert snapshot_count(settings.db_path) == 1
        assert record_if_due(conn, cache, at(10)) is True
        latest = conn.execute("SELECT total_value, recorded_at FROM portfolio_snapshots "
                              "ORDER BY recorded_at DESC LIMIT 1").fetchone()
        assert (latest["total_value"], latest["recorded_at"]) == (10010.0, "2026-01-01T00:00:10Z")
        assert record_if_due(conn, cache, at(10)) is False


def test_one_cent_change_records_and_identical_total_does_not(settings):
    cache = boundary_db(settings, cash=10000.01)
    sql(settings.db_path, "DELETE FROM positions")
    with connect(settings.db_path) as conn:
        assert record_if_due(conn, cache, at(60)) is True
        assert record_if_due(conn, cache, at(120)) is False


def test_empty_table_records_nothing_and_returns_empty_history(client):
    db = client.app.state.settings.db_path
    sql(db, "DELETE FROM portfolio_snapshots")
    assert client.get("/api/portfolio/history").json() == {"history": []}
    assert snapshot_count(db) == 0


def test_same_second_snapshots_return_in_insertion_order(client):
    db = client.app.state.settings.db_path
    sql(db, "DELETE FROM portfolio_snapshots")
    now = now_iso()
    insert_snapshot(db, 1.0, now)
    insert_snapshot(db, 2.0, now)
    insert_snapshot(db, 3.0, OLD)
    assert [p["total_value"] for p in history(client)] == [3.0, 1.0, 2.0]
    assert snapshot_count(db) == 3


def test_history_returns_the_newest_2000_ascending(client):
    db = client.app.state.settings.db_path
    sql(db, "DELETE FROM portfolio_snapshots")
    start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    stamps = [now_iso(start + timedelta(seconds=i)) for i in range(2005)]
    with connect(db) as conn, transaction(conn):
        conn.executemany("INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
                         "VALUES (?, 'default', 10000.0, ?)", [(str(i), s) for i, s in enumerate(stamps)])
    points = history(client)
    assert len(points) == 2000
    assert [p["recorded_at"] for p in points] == stamps[5:]


def test_concurrent_requests_record_at_most_one_snapshot(settings):
    cache = boundary_db(settings)

    def attempt():
        with connect(settings.db_path) as conn:
            return record_if_due(conn, cache, at(60))

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert sorted(results) == [False, True]
    assert snapshot_count(settings.db_path) == 2


def test_post_to_history_is_a_json_404(client):
    response = client.post("/api/portfolio/history", json={"total_value": 1.0})
    assert response.status_code == 404
    assert response.json() == {"error": "Not found"}
    assert len(history(client)) == 1
