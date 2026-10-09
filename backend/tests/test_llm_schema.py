"""ChatReply parsing: every malformed shape raises, nothing odd reaches the trading services."""
import json

import pytest
from pydantic import ValidationError

from app.llm.schema import ChatReply

FULL = {"message": "Buying.", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 10}],
        "watchlist_changes": [{"ticker": "PYPL", "action": "add"}]}


def parse(payload) -> ChatReply:
    return ChatReply.model_validate_json(json.dumps(payload))


def test_full_reply_parses():
    reply = parse(FULL)
    assert reply.trades[0].model_dump() == {"ticker": "AAPL", "side": "buy", "quantity": 10.0}
    assert reply.watchlist_changes[0].model_dump() == {"ticker": "PYPL", "action": "add"}


def test_message_only_reply_defaults_both_lists_to_empty():
    reply = parse({"message": "hi"})
    assert reply.trades == [] and reply.watchlist_changes == []


def test_message_may_be_empty():
    assert parse({"message": ""}).message == ""


@pytest.mark.parametrize("payload", [
    {"message": "x", "extra": 1},
    {"message": "x", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1, "note": "x"}]},
    {"message": "x", "watchlist_changes": [{"ticker": "AAPL", "action": "add", "note": "x"}]},
])
def test_unknown_keys_are_rejected_at_every_level(payload):
    with pytest.raises(ValidationError):
        parse(payload)


def test_side_and_action_outside_their_enums_are_rejected():
    with pytest.raises(ValidationError):
        parse({"message": "x", "trades": [{"ticker": "AAPL", "side": "hold", "quantity": 1}]})
    with pytest.raises(ValidationError):
        parse({"message": "x", "watchlist_changes": [{"ticker": "AAPL", "action": "toggle"}]})


@pytest.mark.parametrize("quantity", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_quantity_is_rejected(quantity):
    raw = '{"message": "x", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": ' + quantity + "}]}"
    with pytest.raises(ValidationError):
        ChatReply.model_validate_json(raw)


def test_numeric_string_quantity_coerces_to_float():
    reply = parse({"message": "x", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": "5"}]})
    assert reply.trades[0].quantity == 5.0


FENCED = "```json\n" + '{"message": "x"}' + "\n```"
LONE_SURROGATE = '{"message": "bad \\ud800 text"}'


@pytest.mark.parametrize("raw", [None, "", "{}", FENCED, "not json", LONE_SURROGATE])
def test_unusable_model_output_is_rejected(raw):
    with pytest.raises(ValidationError):
        ChatReply.model_validate_json(raw)


def test_message_text_is_carried_verbatim():
    text = "Prix: 5 € \U0001F600"
    assert parse({"message": text}).message == text


BANNED = {"oneOf", "allOf", "not", "pattern", "format", "minItems", "maxItems", "nullable", "anyOf"}


def walk(node):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk(item)


def test_json_schema_avoids_keywords_cerebras_does_not_support():
    nodes = list(walk(ChatReply.model_json_schema()))
    assert not any(BANNED & node.keys() for node in nodes)


def test_every_object_schema_forbids_additional_properties():
    objects = [n for n in walk(ChatReply.model_json_schema()) if "properties" in n]
    assert len(objects) == 3
    assert all(node.get("additionalProperties") is False for node in objects)
