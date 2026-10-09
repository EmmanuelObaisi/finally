"""Portfolio value history: newest snapshots, with a guarded snapshot on request."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from .db import USER_ID, connect, now_iso, transaction
from .portfolio import build_portfolio

router = APIRouter()
MIN_INTERVAL_SECONDS = 10
MAX_POINTS = 2000


def record_if_due(conn, cache, now: datetime) -> bool:
    """Record one snapshot if the latest is at least MIN_INTERVAL_SECONDS old and the value changed.

    The read and the insert share one transaction, so concurrent requests insert at most one.
    With no snapshot to compare against, nothing is recorded.
    """
    with transaction(conn):
        row = conn.execute(
            "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? "
            "ORDER BY recorded_at DESC, rowid DESC LIMIT 1",
            (USER_ID,),
        ).fetchone()
        if row is None:
            return False
        age = (now - datetime.fromisoformat(row["recorded_at"])).total_seconds()
        total = build_portfolio(conn, cache)["total_value"]
        if age < MIN_INTERVAL_SECONDS or total == row["total_value"]:
            return False
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), USER_ID, total, now_iso(now)),
        )
        return True


@router.get("/api/portfolio/history")
def get_history(request: Request) -> dict:
    """Snapshots oldest first; may first record one guarded snapshot."""
    with connect(request.app.state.settings.db_path) as conn:
        record_if_due(conn, request.app.state.cache, datetime.now(timezone.utc))
        rows = conn.execute(
            "SELECT total_value, recorded_at FROM portfolio_snapshots WHERE user_id = ? "
            "ORDER BY recorded_at DESC, rowid DESC LIMIT ?",
            (USER_ID, MAX_POINTS),
        ).fetchall()
    return {"history": [dict(r) for r in reversed(rows)]}
