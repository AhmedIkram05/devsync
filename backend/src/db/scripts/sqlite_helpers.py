"""Shared SQLite identifier helpers."""

import re

_VALID_SQLITE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def assert_valid_sqlite_identifier(identifier):
    if not isinstance(identifier, str) or not _VALID_SQLITE_IDENTIFIER.match(identifier):
        raise ValueError(f"Invalid SQLite identifier: {identifier!r}")
    return identifier


def quote_sqlite_identifier(identifier):
    """Quote SQLite identifiers for PRAGMA statements."""
    assert_valid_sqlite_identifier(identifier)
    return '"' + identifier.replace('"', '""') + '"'
