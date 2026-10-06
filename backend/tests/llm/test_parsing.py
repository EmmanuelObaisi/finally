"""Structured output parsing."""

import pytest
from pydantic import ValidationError

from app.llm.client import parse_response


def test_full_response():
    raw = ('{"message": "Done", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 2.5}],'
           ' "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]}')
    result = parse_response(raw)
    assert result.message == "Done"
    assert result.trades[0].ticker == "AAPL"
    assert result.trades[0].quantity == 2.5
    assert result.watchlist_changes[0].action == "add"


def test_optional_fields_missing():
    result = parse_response('{"message": "Hello"}')
    assert result.trades == []
    assert result.watchlist_changes == []


@pytest.mark.parametrize("raw", [
    "not json",
    '{"trades": []}',
    '{"message": "x", "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}]}',
    '{"message": "x", "watchlist_changes": [{"ticker": "AAPL", "action": "delete"}]}',
])
def test_malformed_raises(raw):
    with pytest.raises(ValidationError):
        parse_response(raw)
