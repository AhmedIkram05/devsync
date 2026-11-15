#!/usr/bin/env python3
"""Live parity check for GITHUB_METRICS_BACKEND=hybrid vs rest.

CI has no GitHub token, so the new metric paths can only be proven against the
real API. Without a token this exits 0 with a skip notice, which keeps it safe
to wire into any job.

    GITHUB_TOKEN=ghp_... python backend/tests/perf/github_metrics_smoke.py \
        --repo AhmedIkram05/DevSync --since-days 7

Exit codes: 0 = parity (or skip), 1 = drift beyond tolerance.
"""

import argparse
import os
import sys
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.services.github_client import GitHubClient  # noqa: E402


def _timed(call):
    started = time.perf_counter()
    value = call()
    return value, (time.perf_counter() - started) * 1000


def _set_backend(value):
    if value is None:
        os.environ.pop("GITHUB_METRICS_BACKEND", None)
    else:
        os.environ["GITHUB_METRICS_BACKEND"] = value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="AhmedIkram05/DevSync", help="owner/name")
    parser.add_argument("--since-days", type=int, default=7)
    parser.add_argument("--tolerance", type=int, default=0, help="allowed absolute count drift")
    args = parser.parse_args()

    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    if not token:
        print("SKIP: set GITHUB_TOKEN (or GH_TOKEN) to run the live parity check")
        return 0

    owner, _, repo = args.repo.partition("/")
    if not owner or not repo:
        raise SystemExit("--repo must be owner/name")

    client = GitHubClient(access_token=token)

    _set_backend("rest")
    rest_prs, rest_prs_ms = _timed(lambda: client.get_total_pulls_count(owner, repo, since_days=args.since_days))
    rest_commits, rest_commits_ms = _timed(lambda: client.get_recent_commits(owner, repo, since_days=args.since_days))

    _set_backend("hybrid")
    hybrid_prs, hybrid_prs_ms = _timed(lambda: client.get_total_pulls_count(owner, repo, since_days=args.since_days))
    hybrid_commits, hybrid_commits_ms = _timed(
        lambda: client.get_recent_commits(owner, repo, since_days=args.since_days)
    )

    print(f"repo: {owner}/{repo}  window: {args.since_days}d\n")
    print("| Metric | rest | hybrid | rest ms | hybrid ms |")
    print("|---|---|---|---|---|")
    print(f"| windowed PRs | {rest_prs} | {hybrid_prs} | {rest_prs_ms:.0f} | {hybrid_prs_ms:.0f} |")
    print(f"| recent commits | {rest_commits} | {hybrid_commits} | {rest_commits_ms:.0f} | {hybrid_commits_ms:.0f} |")

    problems = []
    for label, rest_value, hybrid_value in (
        ("windowed PRs", rest_prs, hybrid_prs),
        ("recent commits", rest_commits, hybrid_commits),
    ):
        if not isinstance(rest_value, int) or not isinstance(hybrid_value, int):
            problems.append(f"{label}: one path returned no count (rest={rest_value}, hybrid={hybrid_value})")
        elif abs(rest_value - hybrid_value) > args.tolerance:
            problems.append(f"{label}: drift {rest_value} vs {hybrid_value} > tolerance {args.tolerance}")

    if problems:
        print("\nFAIL:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print(f"\nPASS: parity within tolerance {args.tolerance}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
