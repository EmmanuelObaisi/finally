"""Simulator tests: derived start prices, GBM math, correlation, events, seeding."""
import os
import subprocess
import sys
from pathlib import Path

from app.market.cache import PriceCache
from app.market.simulator import SimulatorDataSource, derived_price

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_derived_price_known_values():
    assert derived_price("PYPL") == 211.74
    assert derived_price("ZZZZ") == 196.93


def test_derived_price_is_process_independent():
    code = "from app.market.simulator import derived_price; print(derived_price('PYPL'), derived_price('ZZZZ'))"
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        env={**os.environ, "PYTHONHASHSEED": "12345"},
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.split() == ["211.74", "196.93"]


async def test_source_add_unknown_ticker_caches_derived_price():
    cache = PriceCache()
    source = SimulatorDataSource(cache)
    await source.add_ticker("PYPL")
    update = cache.get("PYPL")
    assert update.price == 211.74
    assert update.session_start_price == 211.74
    assert cache.version == 1
    await source.add_ticker("PYPL")
    assert cache.version == 1
