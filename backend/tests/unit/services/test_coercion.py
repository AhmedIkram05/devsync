"""Unit tests for services.coercion.to_int."""

from src.services.coercion import to_int


def test_to_int_coerces_numeric_strings():
    assert to_int("42") == 42
    assert to_int(3.9) == 3


def test_to_int_returns_none_for_invalid():
    assert to_int(None) is None
    assert to_int("abc") is None
    assert to_int("") is None
