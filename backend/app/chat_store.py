"""Chat message persistence: one transaction per turn, newest-window reads."""
import json
import uuid

from .db import USER_ID, now_iso, transaction

INSERT = (
    "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
    "VALUES (?, ?, ?, ?, ?, ?)"
)


def save_turn(conn, user_text: str, asked_at: str, reply_text: str, actions: list[dict]) -> None:
    """Store the user row then the assistant row in one transaction."""
    with transaction(conn):
        conn.execute(INSERT, (str(uuid.uuid4()), USER_ID, "user", user_text, None, asked_at))
        conn.execute(
            INSERT,
            (str(uuid.uuid4()), USER_ID, "assistant", reply_text, json.dumps(actions), now_iso()),
        )


def load_recent(conn, limit: int) -> list[dict]:
    """The newest `limit` messages by insertion order, oldest first; actions parsed from JSON.

    created_at is display-only: a user row carries the time the question was asked, so ordering by
    it would interleave overlapping turns.
    """
    rows = conn.execute(
        "SELECT id, role, content, actions, created_at FROM chat_messages WHERE user_id = ? "
        "ORDER BY rowid DESC LIMIT ?",
        (USER_ID, limit),
    ).fetchall()
    return [
        {**dict(row), "actions": json.loads(row["actions"]) if row["actions"] is not None else None}
        for row in reversed(rows)
    ]
