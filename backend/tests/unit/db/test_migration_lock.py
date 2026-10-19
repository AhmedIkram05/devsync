"""Tests for the Alembic advisory lock helper."""

from unittest.mock import MagicMock

from backend.src.db.migration_lock import MIGRATION_LOCK_KEY, migration_lock


def _engine(dialect_name):
    engine = MagicMock()
    engine.dialect.name = dialect_name
    return engine


def test_sqlite_is_a_no_op():
    engine = _engine("sqlite")

    with migration_lock(engine):
        pass

    engine.connect.assert_not_called()


def test_postgres_locks_and_releases():
    engine = _engine("postgresql")
    connection = engine.connect.return_value

    with migration_lock(engine):
        connection.exec_driver_sql.assert_called_once_with(f"SELECT pg_advisory_lock({MIGRATION_LOCK_KEY})")

    assert connection.exec_driver_sql.call_args_list[-1].args == (f"SELECT pg_advisory_unlock({MIGRATION_LOCK_KEY})",)
    connection.close.assert_called_once()


def test_postgres_releases_lock_when_body_raises():
    engine = _engine("postgresql")
    connection = engine.connect.return_value

    try:
        with migration_lock(engine):
            raise RuntimeError("migration blew up")
    except RuntimeError:
        pass

    assert connection.exec_driver_sql.call_count == 2
    connection.close.assert_called_once()
