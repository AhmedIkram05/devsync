# DevSync API Load Testing (k6)

CI job: `perf` in `.github/workflows/ci.yml` — the 8th path-aware job, gated on
`backend/**` changes. It is a **hard gate**, not a reporting step: k6 threshold
breaches fail the build.

## Why it exists

- Correlated concurrency bugs are invisible to unit tests. `pytest -n auto` can
  never tell you that the dashboard handler serializes all requests through a
  lock, or that the rate limiter throttles real traffic to 300 req/min.
- It enforces a **P95 latency ceiling at a sustained request rate** on every
  backend change, plus regression detection against a committed baseline.
- It runs separately from the automated test suite: load-test iterations are
  measurements, not tests, so they are never folded into the functional test
  counts (they produce the `load-test-results` artifact instead).

## What it measures

`backend/tests/perf/api-load.js`:

1. Registers a throwaway user, logs in, extracts the JWT.
2. Under constant VUs (10 VUs / 30s in CI), hits the developer read surface:
   - `GET /api/v1/dashboard`
   - `GET /api/v1/dashboard/client`
3. Enforces thresholds **in-script** (so local and CI runs agree):
   - error rate < 1%
   - `http_req_duration` p(95) < 500ms, p(99) < 1000ms

`/reports` is intentionally excluded: it requires TEAM_LEAD/ADMIN, so hitting
it as a developer is load-testing a permission denial, not a feature.

**These are CI execution ceilings, not production SLOs.** CI runs a single
gunicorn worker on a shared 2-vCPU runner. Production SLO numbers belong to a
scheduled perf environment against a production-like stack; this job's job is
to stop order-of-magnitude regressions from merging.

## Rate limiter override

The global rate limiter (300 req/min) would reject a load test, so it is
env-tunable: `RATE_LIMIT_REQUESTS_PER_WINDOW=0` disables it. Defaults are
unchanged anywhere else, and **this must never be set in production** — it
exists only so the load test saturates the app instead of its throttle.

## Baseline lifetime (regression gate)

The absolute thresholds gate every run. The relative gate works like this:

1. First run: no `backend/tests/perf/baseline.json` → CI passes with a warning.
2. After a clean run, download the `load-test-results` artifact and arm the gate:

   ```sh
   python3 backend/tests/perf/check_baseline.py results.json \
       --baseline backend/tests/perf/baseline.json --update
   git add backend/tests/perf/baseline.json && git commit -m "perf: arm load-test baseline"
   ```

3. Future runs fail on order-of-magnitude regressions only (p95 > 3× baseline,
   p99 > 4×, error rate > +5pp, or sustained req/s < 70%) — wide margins
   because the delta signal on a shared CI runner, not the absolute number, is
   the trustworthy one.

## Running locally

```sh
# 1. DB (Postgres) + backend
make db-up                                   # local compose maps Postgres to :5433
cd backend && export DATABASE_URL=postgresql://devsync:devsync@localhost:5433/devsync
# development (NOT testing — testing pins SQLite in-memory, so the schema
# created by this process would never reach the gunicorn process under load)
export FLASK_ENV=development JWT_SECRET_KEY=dev-local-jwt-secret
export RATE_LIMIT_REQUESTS_PER_WINDOW=0   # load-test override only
.venv/bin/python -c "from src.app import create_app; from src.db.models import db; a,_=create_app(); c=a.app_context(); c.push(); db.create_all(); c.pop()"
.venv/bin/gunicorn src.wsgi:app -c gunicorn.conf.py &

# 2. k6 (brew install k6, or Docker if no local k6:)
#    docker run --rm -v "$PWD/tests/perf:/perf" grafana/k6 \
#      run --vus 10 --duration 30s --summary-export=/perf/summary.json \
#      -e BASE_URL=http://host.docker.internal:8000 /perf/api-load.js
k6 run --vus 10 --duration 30s --summary-export=/tmp/k6-summary.json tests/perf/api-load.js
```

> The CI `perf` job runs `FLASK_ENV=development` for the same reason: `testing`
> swaps in a per-process in-memory SQLite DB, which would leave the gunicorn
> worker staring at an empty database.
