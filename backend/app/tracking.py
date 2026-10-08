"""Ticker identity and the tracking rule: a ticker streams exactly when it is watched or held."""
import re

from .errors import DomainError

TICKER = re.compile(r"[A-Z][A-Z.]{0,9}")


def normalize_ticker(raw: str) -> str:
    """Upper-case an ASCII symbol and check its format; reject anything else."""
    ticker = raw.upper() if raw.isascii() else ""
    if TICKER.fullmatch(ticker) is None:
        raise DomainError(f"Invalid ticker: {raw}")
    return ticker
