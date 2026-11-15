"""Per-request logs are lazy and request-noise is demoted to DEBUG.

Source-level guards: these lines are too shallow to exercise without a full
request, and a regression is only visible as wasted formatting/log volume.
"""

from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"


def _source(relative):
    return (SRC / relative).read_text()


def test_dashboard_request_logs_are_debug_and_lazy():
    source = _source("api/controllers/dashboard_controller.py")

    assert 'logger.info(f"Getting' not in source
    assert 'logger.debug("Getting dashboard for user ID: %s, role: %s", user_id, user_role)' in source
    assert 'logger.debug("Getting member dashboard for user ID: %s, role: %s", user_id, user_role)' in source
    assert 'logger.debug("Getting admin dashboard for user ID: %s", user_id)' in source


def test_github_perf_logs_are_lazy():
    source = _source("api/controllers/github_controller.py")

    assert 'logger.info(f"[PERF]' not in source
    assert 'logger.info("[PERF] GitHub API call took %.2fs - got %s repos", api_time, len(repositories))' in source
    assert 'logger.info("[PERF] get_github_repositories COMPLETE - total time: %.2fs", total_time)' in source
    assert 'logger.info("[PERF] Database flush took %.2fs - added %s new repos", flush_time, len(new_repos))' in source
