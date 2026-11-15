"""GitHub activity metrics: request-count behaviour and fallback.

The flag must be a no-op at its default (``rest``) and the hybrid path must
collapse each metric to a single request, falling back to the old walk on any
GitHub-side failure.
"""

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from src.services.github_client import GitHubClient

GITHUB_CLIENT_SOURCE = Path(__file__).resolve().parents[3] / "src" / "services" / "github_client.py"


def _now_iso():
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _response(status=200, payload=None, headers=None, text=""):
    response = MagicMock()
    response.status_code = status
    response.json.return_value = payload
    response.headers = headers or {}
    response.text = text
    return response


@pytest.fixture
def client():
    return GitHubClient(access_token="test-token")


def test_default_backend_keeps_page_walking(monkeypatch, client):
    monkeypatch.delenv("GITHUB_METRICS_BACKEND", raising=False)
    pages = [
        _response(payload=[{"id": index} for index in range(100)]),
        _response(payload=[{"id": 999}]),
    ]
    with patch("src.services.github_client.requests.get", side_effect=pages) as mock_get:
        assert client.get_recent_commits("owner", "repo", since_days=7) == 101
    assert mock_get.call_count == 2


def test_hybrid_commits_uses_one_link_header_request(monkeypatch, client):
    monkeypatch.setenv("GITHUB_METRICS_BACKEND", "hybrid")
    link = '<https://api.github.com/repositories/1/commits?page=42>; rel="last"'
    response = _response(payload=[{"sha": "abc"}], headers={"Link": link})

    with patch("src.services.github_client.requests.get", return_value=response) as mock_get:
        assert client.get_recent_commits("owner", "repo", since_days=7) == 42

    assert mock_get.call_count == 1
    assert mock_get.call_args.kwargs["params"]["per_page"] == 1


def test_hybrid_commits_without_link_falls_back_to_item_count(monkeypatch, client):
    monkeypatch.setenv("GITHUB_METRICS_BACKEND", "hybrid")
    response = _response(payload=[])

    with patch("src.services.github_client.requests.get", return_value=response):
        assert client.get_recent_commits("owner", "repo", since_days=7) == 0


def test_hybrid_commits_failure_falls_back_to_page_walk(monkeypatch, client):
    monkeypatch.setenv("GITHUB_METRICS_BACKEND", "hybrid")
    responses = [
        _response(status=500, payload={}),  # _count_commits_via_link -> None
        _response(payload=[{"sha": "a"}, {"sha": "b"}]),  # page walk
    ]

    with patch("src.services.github_client.requests.get", side_effect=responses) as mock_get:
        assert client.get_recent_commits("owner", "repo", since_days=7) == 2

    assert mock_get.call_count == 2


def test_hybrid_windowed_prs_uses_search_once(monkeypatch, client):
    monkeypatch.setenv("GITHUB_METRICS_BACKEND", "hybrid")

    with patch(
        "src.services.github_client.requests.get",
        return_value=_response(payload={"total_count": 17}),
    ) as mock_get:
        assert client.get_total_pulls_count("owner", "repo", since_days=30) == 17

    assert mock_get.call_count == 1
    assert "/search/issues" in mock_get.call_args.args[0]
    query = mock_get.call_args.kwargs["params"]["q"]
    assert "repo:owner/repo" in query
    assert "type:pr" in query
    assert "created:>=" in query


def test_hybrid_windowed_prs_search_failure_falls_back_to_page_walk(monkeypatch, client):
    monkeypatch.setenv("GITHUB_METRICS_BACKEND", "hybrid")
    fresh = {"number": 1, "created_at": _now_iso()}
    responses = [
        _response(status=500, payload={}),  # search -> None
        _response(payload=[fresh]),  # page-walk page 1 (< per_page -> stop)
    ]

    with patch("src.services.github_client.requests.get", side_effect=responses) as mock_get:
        assert client.get_total_pulls_count("owner", "repo", since_days=30) == 1

    assert mock_get.call_count == 2


def test_rest_backend_windowed_prs_never_calls_search(monkeypatch, client):
    monkeypatch.setenv("GITHUB_METRICS_BACKEND", "rest")

    with patch(
        "src.services.github_client.requests.get",
        return_value=_response(payload=[{"number": 1, "created_at": _now_iso()}]),
    ) as mock_get:
        assert client.get_total_pulls_count("owner", "repo", since_days=30) == 1

    assert mock_get.call_count == 1
    assert "/search/issues" not in mock_get.call_args.args[0]


def test_non_windowed_pull_fast_path_is_unchanged(monkeypatch, client):
    monkeypatch.setenv("GITHUB_METRICS_BACKEND", "hybrid")
    link = '<https://api.github.com/repositories/1/pulls?page=9>; rel="last"'

    with patch(
        "src.services.github_client.requests.get",
        return_value=_response(payload=[{"number": 1}], headers={"Link": link}),
    ) as mock_get:
        assert client.get_total_pulls_count("owner", "repo") == 9

    assert mock_get.call_count == 1


def test_github_client_logs_are_lazy():
    source = GITHUB_CLIENT_SOURCE.read_text()

    assert 'logger.info(f"GitHub token exchange' not in source
    assert 'logger.info(f"Retrying' not in source
    assert 'logger.info("GitHub token exchange response status: %s", status_code)' in source
    assert 'logger.info("Retrying... (attempt %s/%s)", retry_count, max_retries)' in source
