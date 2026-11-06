"""Shared type coercion helpers."""


def to_int(value):
    """Return int(value), or None if value is not coercible."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
