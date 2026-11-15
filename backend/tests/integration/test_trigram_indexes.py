"""pg_trgm mechanics on a real Postgres.

Skipped everywhere except the CI integration job (which sets a postgresql
DATABASE_URL). Uses a TEMP table so it cannot collide with sibling tests and
needs no fixture schema.
"""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

DATABASE_URL = os.getenv("DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL.startswith("postgresql"),
    reason="requires a Postgres DATABASE_URL (CI integration job provides one)",
)


def test_pg_trgm_gin_index_serves_leading_wildcard_ilike():
    engine = create_engine(DATABASE_URL)
    try:
        with engine.connect() as probe:
            probe.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("Postgres DATABASE_URL is set but not reachable")

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        conn.execute(text("CREATE TEMP TABLE trigram_probe (body text)"))
        conn.execute(text("CREATE INDEX trigram_probe_body_trgm ON trigram_probe USING gin (body gin_trgm_ops)"))
        conn.execute(text("INSERT INTO trigram_probe (body) SELECT 'needle ' || g FROM generate_series(1, 500) g"))
        conn.execute(text("SET LOCAL enable_seqscan = off"))
        plan = "\n".join(
            row[0] for row in conn.execute(text("EXPLAIN SELECT * FROM trigram_probe WHERE body ILIKE '%needle%'"))
        )
        extension_installed = conn.execute(text("SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'")).scalar()

    assert extension_installed == 1
    assert "Index" in plan
    assert "Seq Scan" not in plan
