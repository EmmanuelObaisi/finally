from app.market.cache import PriceCache
from app.market.models import PriceUpdate


def test_first_update_is_flat_and_sets_reference():
    cache = PriceCache()
    u = cache.update("AAPL", 190.0)
    assert u.previous_price == 190.0
    assert u.reference_price == 190.0
    assert u.direction == "flat"
    assert u.change == 0
    assert cache.version == 1


def test_second_update_sets_direction_and_keeps_reference():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    up = cache.update("AAPL", 190.5)
    assert up.direction == "up"
    assert up.change == 0.5
    assert up.reference_price == 190.0
    down = cache.update("AAPL", 189.0)
    assert down.direction == "down"
    assert down.previous_price == 190.5
    assert down.day_change_percent == round((189 / 190 - 1) * 100, 4)


def test_explicit_reference_price_wins():
    cache = PriceCache()
    u = cache.update("AAPL", 191.9, reference_price=190.58)
    assert u.reference_price == 190.58


def test_prices_rounded_to_cents():
    cache = PriceCache()
    cache.update("AAPL", 190.001)
    u = cache.update("AAPL", 190.004)
    assert u.price == 190.0
    assert u.direction == "flat"


def test_get_and_remove():
    cache = PriceCache()
    assert cache.get_price("AAPL") is None
    cache.update("AAPL", 190.0)
    assert cache.get_price("AAPL") == 190.0
    assert isinstance(cache.get("AAPL"), PriceUpdate)
    v = cache.version
    cache.remove("AAPL")
    assert cache.get("AAPL") is None
    assert cache.version == v + 1
    cache.remove("AAPL")  # unknown ticker: no version bump
    assert cache.version == v + 1


def test_get_all_is_a_copy():
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    snapshot = cache.get_all()
    cache.update("MSFT", 420.0)
    assert set(snapshot) == {"AAPL"}


def test_to_dict_shape():
    u = PriceUpdate("AAPL", 191.0, 190.0, 190.0, 1.0)
    assert u.to_dict() == {
        "ticker": "AAPL",
        "price": 191.0,
        "previous_price": 190.0,
        "timestamp": 1.0,
        "change": 1.0,
        "direction": "up",
        "day_change_percent": round((191 / 190 - 1) * 100, 4),
    }
