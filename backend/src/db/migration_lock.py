"""Postgres advisory lock that serialises concurrent Alembic upgrades."""

from contextlib import contextmanager

# Arbitrary but stable key: 0x64657673 == b"devs".
MIGRATION_LOCK_KEY = 0x64657673


@contextmanager
def migration_lock(engine):
    """Hold an advisory lock for the duration of a migration run.

    Alembic's ``upgrade`` is not concurrency-safe: two migrate pods (a retried
    Job, or a new Job's pod overlapping the previous one while it drains) can
    interleave DDL and corrupt the version table. Postgres advisory locks are
    session-scoped, so they cover the whole migration and are released when the
    connection closes - including when the pod is killed at
    ``activeDeadlineSeconds``.

    No-op on other dialects: SQLite (the test suite) has no advisory locks, and
    a single in-memory connection cannot race itself.
    """
    if engine.dialect.name != "postgresql":
        yield
        return

    # A dedicated connection, so the lock never shares a transaction with the
    # connection Alembic runs the migration on.
    lock_connection = engine.connect()
    try:
        lock_connection.exec_driver_sql(f"SELECT pg_advisory_lock({MIGRATION_LOCK_KEY})")
        yield
    finally:
        try:
            lock_connection.exec_driver_sql(f"SELECT pg_advisory_unlock({MIGRATION_LOCK_KEY})")
        finally:
            lock_connection.close()
