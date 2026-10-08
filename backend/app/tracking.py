"""Ticker identity and the tracking rule: a ticker streams exactly when it is watched or held."""
import asyncio
import re

from .db import USER_ID, connect
from .errors import DomainError

TICKER = re.compile(r"[A-Z][A-Z.]{0,9}")


def normalize_ticker(raw: str) -> str:
    """Upper-case an ASCII symbol and check its format; reject anything else."""
    ticker = raw.upper() if raw.isascii() else ""
    if TICKER.fullmatch(ticker) is None:
        raise DomainError(f"Invalid ticker: {raw}")
    return ticker


def is_wanted(db_path, ticker: str) -> bool:
    """True when the ticker is on the watchlist or has an open position."""
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT 1 FROM watchlist WHERE user_id = ? AND ticker = ? "
            "UNION ALL SELECT 1 FROM positions WHERE user_id = ? AND ticker = ?",
            (USER_ID, ticker, USER_ID, ticker),
        ).fetchone()
    return row is not None


async def sync_ticker(state, ticker: str) -> None:
    """Track the ticker exactly when it is watched or held; idempotent both ways."""
    if await asyncio.to_thread(is_wanted, state.settings.db_path, ticker):
        await state.source.add_ticker(ticker)
    else:
        await state.source.remove_ticker(ticker)
