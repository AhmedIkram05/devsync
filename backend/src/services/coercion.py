"""Shared type coercion helpers."""


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
