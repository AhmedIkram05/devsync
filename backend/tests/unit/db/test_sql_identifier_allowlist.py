import pathlib

import pytest

from backend.src.db.scripts.sqlite_helpers import assert_valid_sqlite_identifier, quote_sqlite_identifier


def test_valid_identifiers():
    for name in ["users", "_private", "idx_tasks_status", "A1", "a_b_c123"]:
        assert assert_valid_sqlite_identifier(name) == name
        assert quote_sqlite_identifier(name) == f'"{name}"'


def test_invalid_identifiers():
    for bad in ["", "1abc", "a-b", "a b", "a;b", 'a"b', "a.b", None, 123, "a/b", "x' OR '1'='1"]:
        with pytest.raises(ValueError):
            assert_valid_sqlite_identifier(bad)
        with pytest.raises(ValueError):
            quote_sqlite_identifier(bad)


def test_scripts_use_allowlist():
    root = pathlib.Path(__file__).resolve().parents[3] / "src" / "db" / "scripts"
    for filename in ("setup_database.py", "inspect_database.py"):
        text = (root / filename).read_text()
        assert "assert_valid_sqlite_identifier" in text or "quote_sqlite_identifier" in text
        # No raw text(f"...) without prior validation helper present
        if "text(f" in text:
            assert "sqlite_helpers" in text
