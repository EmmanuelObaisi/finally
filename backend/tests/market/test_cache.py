"""PriceCache and PriceUpdate behavior."""
from app.market.cache import PriceCache

EIGHT_KEYS = {"ticker", "price", "previous_price", "timestamp", "change", "change_percent",
              "direction", "session_start_price"}


def test_first_update_is_flat_and_sets_session_start():
    cache = PriceCache()
    update = cache.update("AAPL", 190.0)
    assert update.previous_price == 190.0
    assert update.session_start_price == 190.0
    assert update.direction == "flat"
    assert update.change == 0.0
    assert update.change_percent == 0.0
    assert cache.version == 1


def test_second_update_sets_direction_and_change_from_first():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    update = cache.update("AAPL", 190.12)
    assert update.direction == "up"
    assert update.change == 0.12
    assert update.previous_price == 190.0
    assert update.session_start_price == 190.0


def test_price_is_rounded_to_two_decimals():
    cache = PriceCache()
    assert cache.update("AAPL", 190.123).price == 190.12


def test_change_percent_is_measured_from_session_start():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    cache.update("AAPL", 195.0)
    update = cache.update("AAPL", 192.5)
    assert update.change == round(192.5 - 195.0, 4)
    assert update.change_percent == round((192.5 / 190.0 - 1) * 100, 4)


def test_remove_bumps_version_only_for_a_known_ticker():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    cache.remove("ZZZZ")
    assert cache.version == 1
    cache.remove("AAPL")
    assert cache.version == 2
    assert cache.get("AAPL") is None


def test_get_all_returns_a_copy():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    snapshot = cache.get_all()
    snapshot.clear()
    assert list(cache.get_all()) == ["AAPL"]


def test_to_dict_has_exactly_the_eight_keys():
    update = PriceCache().update("AAPL", 190.0)
    assert set(update.to_dict()) == EIGHT_KEYS


def test_a_price_that_rounds_to_zero_is_ignored():
    cache = PriceCache()
    assert cache.update("PENNY", 0.004) is None
    assert cache.get("PENNY") is None
    assert cache.version == 0
