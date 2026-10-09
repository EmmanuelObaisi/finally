"""chat_store: atomic turn writes and newest-window reads against a real SQLite file."""
import threading
import uuid

import pytest

from app.chat_store import load_recent, save_turn
from app.db import connect, init_db

ACTIONS = [{"type": "trade", "ticker": "AAPL", "ok": True}]


@pytest.fixture
def db_path(tmp_path):
    path = tmp_path / "store.db"
    init_db(path)
    return path


def test_save_turn_then_load_recent_returns_the_pair_oldest_first(db_path):
    with connect(db_path) as conn:
        save_turn(conn, "hi", "2026-01-01T00:00:00Z", "hello", ACTIONS)
        rows = load_recent(conn, 10)
    assert [(r["role"], r["content"]) for r in rows] == [("user", "hi"), ("assistant", "hello")]
    assert rows[0]["actions"] is None and rows[1]["actions"] == ACTIONS


def test_save_turn_failure_rolls_back_both_rows(db_path, monkeypatch):
    real, calls = uuid.uuid4, []

    def flaky():
        calls.append(1)
        if len(calls) == 2:
            raise RuntimeError("boom")
        return real()

    monkeypatch.setattr("app.chat_store.uuid.uuid4", flaky)
    with connect(db_path) as conn:
        with pytest.raises(RuntimeError):
            save_turn(conn, "hi", "2026-01-01T00:00:00Z", "hello", [])
        assert load_recent(conn, 10) == []


def test_two_threads_keep_each_pair_adjacent(db_path):
    def worker(tag):
        with connect(db_path) as conn:
            for i in range(25):
                save_turn(conn, f"{tag}-{i}", "2026-01-01T00:00:00Z", f"{tag}-{i}-reply", [])

    threads = [threading.Thread(target=worker, args=(t,)) for t in "ab"]
    [t.start() for t in threads]
    [t.join() for t in threads]
    with connect(db_path) as conn:
        contents = [r["content"] for r in conn.execute(
            "SELECT content FROM chat_messages ORDER BY rowid").fetchall()]
    assert len(contents) == 100
    for user, assistant in zip(contents[0::2], contents[1::2]):
        assert assistant == f"{user}-reply"


def test_load_recent_limit_returns_newest_oldest_first(db_path):
    with connect(db_path) as conn:
        for i in range(5):
            conn.execute(
                "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
                "VALUES (?, 'default', 'user', ?, NULL, ?)", (f"i{i}", f"m{i}", f"2026-01-01T00:00:0{i}Z"))
        assert [r["content"] for r in load_recent(conn, 3)] == ["m2", "m3", "m4"]


def test_same_second_rows_keep_insertion_order(db_path, monkeypatch):
    monkeypatch.setattr("app.chat_store.now_iso", lambda: "2026-01-01T00:00:00Z")
    with connect(db_path) as conn:
        for i in range(3):
            save_turn(conn, f"u{i}", "2026-01-01T00:00:00Z", f"a{i}", [])
        assert [r["content"] for r in load_recent(conn, 10)] == ["u0", "a0", "u1", "a1", "u2", "a2"]


def test_overlapping_turns_keep_each_question_with_its_reply(db_path, monkeypatch):
    """Turn A asks first but finishes after B asks; each pair must stay together."""
    with connect(db_path) as conn:
        monkeypatch.setattr("app.chat_store.now_iso", lambda: "2026-01-01T00:00:20Z")
        save_turn(conn, "uA", "2026-01-01T00:00:00Z", "aA", [])
        monkeypatch.setattr("app.chat_store.now_iso", lambda: "2026-01-01T00:00:30Z")
        save_turn(conn, "uB", "2026-01-01T00:00:10Z", "aB", [])
        assert [r["content"] for r in load_recent(conn, 10)] == ["uA", "aA", "uB", "aB"]
