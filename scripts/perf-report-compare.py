#!/usr/bin/env python3
"""Compare the pre-change client report path with GET /reports/data.

Old path (what the frontend used to do): fetch every task page and every user
page concurrently, then reduce in JS. New path: one server-side aggregate.

Run against a seeded local stack:
    python scripts/perf-seed.py
    python scripts/perf-report-compare.py --runs 5

Numbers are wall-clock over a loopback/DevSync stack, not an SLO measurement;
they exist to prove the payload/request reduction and to catch regressions.
"""

import argparse
import os
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

PAGE_SIZE = 100


def login(base_url, email, password):
    session = requests.Session()
    response = session.post(
        f"{base_url}/api/v1/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    response.raise_for_status()
    if "access_token_cookie" not in session.cookies:
        raise SystemExit("login did not set access_token_cookie")
    return session


def fetch_all_pages(session, base_url, path, collection_key):
    started = time.perf_counter()
    total_bytes = 0
    rows = 0
    page = 1
    requests_made = 0
    while True:
        response = session.get(
            f"{base_url}{path}",
            params={"page": page, "per_page": PAGE_SIZE},
            timeout=120,
        )
        response.raise_for_status()
        requests_made += 1
        total_bytes += len(response.content)
        payload = response.json()
        rows += len(payload.get(collection_key) or [])
        pages = (payload.get("pagination") or {}).get("pages") or 1
        if page >= pages:
            break
        page += 1
    return {
        "seconds": time.perf_counter() - started,
        "bytes": total_bytes,
        "rows": rows,
        "requests": requests_made,
    }


def old_path(session, base_url):
    """Mirror the client's Promise.all: tasks and users page-through concurrently."""
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks_future = pool.submit(fetch_all_pages, session, base_url, "/api/v1/tasks", "tasks")
        users_future = pool.submit(fetch_all_pages, session, base_url, "/api/v1/users", "users")
        tasks = tasks_future.result()
        users = users_future.result()
    return {
        "seconds": time.perf_counter() - started,
        "bytes": tasks["bytes"] + users["bytes"],
        "rows": tasks["rows"] + users["rows"],
        "requests": tasks["requests"] + users["requests"],
    }


def new_path(session, base_url, report_type, date_range):
    started = time.perf_counter()
    response = session.get(
        f"{base_url}/api/v1/reports/data",
        params={"type": report_type, "date_range": date_range},
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    return {
        "seconds": time.perf_counter() - started,
        "bytes": len(response.content),
        "rows": len(payload.get("details") or []),
        "requests": 1,
    }


def explain_aggregate(days):
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url.startswith("postgresql"):
        return "skipped (DATABASE_URL is not postgresql)"

    from sqlalchemy import create_engine, text

    engine = create_engine(database_url)
    query = text(
        """
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT count(*),
               count(*) FILTER (WHERE lower(status) IN ('done', 'completed')),
               count(*) FILTER (WHERE lower(status) = 'in_progress'),
               count(*) FILTER (
                   WHERE deadline IS NOT NULL
                     AND deadline < now()
                     AND lower(status) NOT IN ('done', 'completed', 'review', 'in_review')
               )
        FROM tasks
        WHERE created_at >= now() - make_interval(days => :days)
        """
    )
    with engine.connect() as connection:
        return "\n".join(row[0] for row in connection.execute(query, {"days": days}))


def summarise(label, samples):
    return {
        "label": label,
        "median_ms": statistics.median(s["seconds"] for s in samples) * 1000,
        "mean_ms": statistics.mean(s["seconds"] for s in samples) * 1000,
        "payload_kb": statistics.median(s["bytes"] for s in samples) / 1024,
        "requests": int(statistics.median(s["requests"] for s in samples)),
        "rows": int(statistics.median(s["rows"] for s in samples)),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", default="perf-admin@devsync.test")
    parser.add_argument("--password", default="perf-benchmark-password")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--type", default="tasks", choices=["tasks", "developers"])
    parser.add_argument("--date-range", default="month", choices=["week", "month", "quarter", "year"])
    args = parser.parse_args()

    session = login(args.base_url, args.email, args.password)

    old_samples = []
    new_samples = []
    for index in range(args.runs):
        old_samples.append(old_path(session, args.base_url))
        new_samples.append(new_path(session, args.base_url, args.type, args.date_range))
        print(f"run {index + 1}/{args.runs} complete", file=sys.stderr, flush=True)

    old = summarise("old: page tasks + users", old_samples)
    new = summarise("new: GET /reports/data", new_samples)
    reduction = old["payload_kb"] / new["payload_kb"] if new["payload_kb"] else float("inf")

    print(f"## Report aggregation benchmark (N={args.runs}, type={args.type}, range={args.date_range})\n")
    print("| Path | Median | Mean | Payload | Requests | Detail rows |")
    print("|---|---|---|---|---|---|")
    for row in (old, new):
        print(
            f"| {row['label']} | {row['median_ms']:.1f} ms | {row['mean_ms']:.1f} ms | "
            f"{row['payload_kb']:.1f} KB | {row['requests']} | {row['rows']} |"
        )
    print(f"\nPayload reduction: **{reduction:.1f}x**\n")
    print("### EXPLAIN (ANALYZE, BUFFERS) — tasks aggregate\n")
    print("```")
    print(explain_aggregate({"week": 7, "month": 30, "quarter": 90, "year": 365}[args.date_range]))
    print("```")
    return 0


if __name__ == "__main__":
    sys.exit(main())
