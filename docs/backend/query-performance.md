# Query performance evidence

This file records the measurements behind two changes:

1. `pg_trgm` GIN indexes for the four leading-wildcard `ILIKE` searches.
2. Server-side report aggregation (`GET /api/v1/reports/data`).

Numbers are from a local PostgreSQL 16 stack (not a production SLO). The
recorded run used the embedded `pgserver` build (no Docker); the Docker compose
path in "Reproduce" works too. The point is direction and payload size, not
absolute milliseconds.

## Reproduce

```sh
# 1. Local stack + migrations
make db-up
cd backend
DATABASE_URL=postgresql://devsync:devsync@localhost:5433/devsync \
FLASK_ENV=development \
  python -c "from src.app import create_app; from flask_migrate import upgrade; \
app, _ = create_app(); ctx = app.app_context(); ctx.push(); upgrade()"

# 2. Medium dataset (50 users / 10 projects / 5,000 tasks)
cd ..
DATABASE_URL=postgresql://devsync:devsync@localhost:5433/devsync \
  python scripts/perf-seed.py

# 3. Start the backend however you normally do, then:
python scripts/perf-report-compare.py --runs 5 --type tasks --date-range month
```

## What the script reports

- Old path: every task page plus every user page, fetched concurrently the way
  the old client did, recording wall time, payload bytes and request count.
- New path: one `GET /reports/data`, same metrics.
- `EXPLAIN (ANALYZE, BUFFERS)` for the tasks aggregate on the same database.

## Search indexes

`EXPLAIN` for the four search paths must show an index scan once the planner
has enough rows to prefer it. On a small table the planner may still choose a
sequential scan; `SET enable_seqscan = off` proves the index is *usable*:

```sql
SET enable_seqscan = off;
EXPLAIN SELECT * FROM tasks WHERE title ILIKE '%needle%';
-- Bitmap Index Scan on idx_tasks_title_trgm
```

The Postgres integration test (`backend/tests/integration/test_trigram_indexes.py`)
asserts exactly this on a temporary table, so the mechanism is covered in CI
even when the seeded dataset is small.

## Recorded results — 2026-11-15

Environment: embedded PostgreSQL 16.2 (`pgserver`, no Docker), 50 users /
10 projects / 5,000 tasks, gunicorn gevent (1 worker), loopback, N=5 (month)
and N=3 (week). `db.create_all()` supplied the schema, so the migration-only
composite indexes were not present; the report aggregate reads `created_at`,
which the model already indexes.

### tasks / month (N=5)

| Path | Median | Mean | Payload | Requests | Detail rows |
|---|---|---|---|---|---|
| old: page tasks + users | 2,076.2 ms | 2,752.3 ms | 2,167.8 KB | 51 | 5,050 |
| new: `GET /reports/data` | **14.2 ms** | 15.9 ms | **196.9 KB** | **1** | 420 |

Payload reduction: **11.0×**.

### tasks / week (N=3)

| Path | Median | Mean | Payload | Requests | Detail rows |
|---|---|---|---|---|---|
| old: page tasks + users | 2,294.1 ms | 2,934.8 ms | 2,167.8 KB | 51 | 5,050 |
| new: `GET /reports/data` | **13.1 ms** | 11.4 ms | **46.2 KB** | **1** | 98 |

Payload reduction: **46.9×**.

### EXPLAIN — tasks aggregate

```text
Aggregate  (cost=121.94..121.95 rows=1 width=32) (actual time=1.343..1.344 rows=1 loops=1)
  Buffers: shared hit=91
  ->  Seq Scan on tasks  (cost=0.00..110.11 rows=364 width=66) (actual time=0.006..1.162 rows=422 loops=1)
        Filter: (created_at >= (now() - '30 days'::interval))
        Rows Removed by Filter: 4578
        Buffers: shared hit=91
Planning Time: 0.961 ms
Execution Time: 1.365 ms
```

The planner chooses a sequential scan at 5,000 rows because the 30-day window
is ~8% of the table; that is the correct plan at this size. At production row
counts the fraction drops and `idx_tasks_created_at` / the composite scope
indexes become the plan. The aggregate itself is **1.3 ms**; the endpoint's
14 ms is dominated by JSON serialization of the 420 detail rows.

## pg_trgm note

The embedded Postgres used for this run has no contrib modules, so
`CREATE EXTENSION pg_trgm` could not be exercised in this benchmark
environment. The migration's Postgres path is covered by
`backend/tests/integration/test_trigram_indexes.py`, which asserts the `gin_trgm_ops`
index serves `ILIKE '%…%'` and fails loudly if the extension is unavailable.

## Deployment notes

- The migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`. On PG 13+,
  pg_trgm is a trusted extension, so the database owner can install it; if the
  migrate role is neither owner nor superuser and the extension is not
  pre-created, the migrate Job fails before the rollout.
- The indexes are built with plain `CREATE INDEX` (not `CONCURRENTLY`), so
  they hold a write lock while building. That is acceptable for the current
  table sizes and the pre-rollout migrate Job; schedule the deploy around it
  if `audit_logs` grows large.

## Notes

- The **developers** report intentionally keeps the pre-existing semantic of
  aggregating all tasks, not the date-scoped subset. That matches the old
  client behaviour; changing it is a product decision, not a performance fix.
- `details` is capped at 1,000 rows and signals truncation in `meta`.
- Search API / Link-header measurement for GitHub metrics lives in
  `docs/backend/load-testing.md` and the live smoke test, because CI has no
  GitHub token.
