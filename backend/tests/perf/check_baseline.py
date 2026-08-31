#!/usr/bin/env python3
"""Compare a k6 --summary-export JSON file against a committed baseline.

The CI load-test job runs k6 first (its in-script thresholds are the fast,
absolute gate), then this script as the slower, relative gate: it fails the
build only on *order-of-magnitude* regressions against a previously measured
run, because CI load tests run on shared, noisy runners where small deltas are
infrastructure noise, not code signal.

Metric extraction matches the real `k6 --summary-export` schema (verified
against grafana/k6 v0.5x):
    - trend metrics (http_req_duration): percentiles at the top level
      ({"avg","min","med","max","p(90)","p(95)"}); p(99) is NOT exported,
      so the p99 tripwire only applies when a baseline has it.
    - rate metrics (http_req_failed): "value" is the real 0..1 rate. The
      "passes"/"fails" fields on this metric are NOT trustworthy (k6 reports
      fails==total on zero-failure runs); never use them.
    - counter metrics (http_reqs): "rate" (req/s) at the top level.

Baseline lifecycle:
    - No baseline.json → exits 0 with a warning: the gate is armed by
      committing a baseline, not before.
    - After a clean CI run, download the `load-test-results` artifact and run:
          python3 backend/tests/perf/check_baseline.py results.json \
              --baseline backend/tests/perf/baseline.json --update
      then commit backend/tests/perf/baseline.json. Future runs enforce.

Usage:
    python3 check_baseline.py SUMMARY.json --baseline baseline.json [--update]
"""
import argparse
import json
import sys
from datetime import datetime, timezone

# Multipliers/deltas are the regression tripwires. Wide on purpose (see above).
P95_BLOWUP_FACTOR = 3.0
P99_BLOWUP_FACTOR = 4.0
ERROR_RATE_ADD_PP = 0.05   # percentage points, not relative
RPS_DROP_MIN = 0.7          # fail if sustained req/s falls below 70% of baseline


def extract_metrics(summary_path):
    with open(summary_path) as fh:
        data = json.load(fh)
    metrics = data.get("metrics") or {}

    duration = metrics.get("http_req_duration") or {}
    p95 = duration.get("p(95)")
    p99 = duration.get("p(99)")  # absent in k6 exports by default

    error_rate = (metrics.get("http_req_failed") or {}).get("value")  # 0..1
    rps = (metrics.get("http_reqs") or {}).get("rate")

    if p95 is None:
        sys.exit("summary is missing http_req_duration.p(95); is this a k6 --summary-export file?")
    return {"p95_ms": p95, "p99_ms": p99, "error_rate": error_rate, "rps": rps}


def baseline_exists(path):
    try:
        with open(path) as fh:
            data = json.load(fh)
        return "p95_ms" in data
    except (FileNotFoundError, json.JSONDecodeError):
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("summary")
    parser.add_argument("--baseline", default="baseline.json")
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()

    current = extract_metrics(args.summary)

    if args.update:
        current["captured_at"] = datetime.now(timezone.utc).isoformat()
        with open(args.baseline, "w") as fh:
            json.dump(current, fh, indent=2)
        print(f"Baseline written to {args.baseline}: {current}")
        return 0

    if not baseline_exists(args.baseline):
        print(
            f"WARNING: no committed baseline at {args.baseline}; regression gate not armed.\n"
            "Download the load-test-results artifact from a clean CI run and use --update to commit one."
        )
        return 0

    with open(args.baseline) as fh:
        base = json.load(fh)

    failures = []
    if base.get("p95_ms"):
        if current["p95_ms"] > base["p95_ms"] * P95_BLOWUP_FACTOR:
            failures.append(f"p95 {current['p95_ms']:.0f}ms > {P95_BLOWUP_FACTOR}x baseline ({base['p95_ms']:.0f}ms)")
    if base.get("p99_ms") and current["p99_ms"]:
        if current["p99_ms"] > base["p99_ms"] * P99_BLOWUP_FACTOR:
            failures.append(f"p99 {current['p99_ms']:.0f}ms > {P99_BLOWUP_FACTOR}x baseline ({base['p99_ms']:.0f}ms)")
    if base.get("error_rate") is not None and current["error_rate"] is not None:
        if current["error_rate"] > base["error_rate"] + ERROR_RATE_ADD_PP:
            failures.append(
                f"error rate {current['error_rate']:.1%} > baseline {base['error_rate']:.1%} + {ERROR_RATE_ADD_PP:.0%}"
            )
    if base.get("rps") is not None and current["rps"] is not None:
        if current["rps"] < base["rps"] * RPS_DROP_MIN:
            failures.append(f"rps {current['rps']:.1f} < {RPS_DROP_MIN:.0%} of baseline ({base['rps']:.1f})")

    if failures:
        print("LOAD TEST REGRESSION:")
        for message in failures:
            print(f"  - {message}")
        return 1

    print(f"Within baseline tolerance (p95 {current['p95_ms']:.0f}ms vs {base['p95_ms']:.0f}ms).")
    return 0


if __name__ == "__main__":
    sys.exit(main())