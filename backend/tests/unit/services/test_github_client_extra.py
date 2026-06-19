import base64
import json

from src.services.github_client import GitHubClient


def test_state_param_roundtrip():
    s = GitHubClient.create_state_param(42)
    uid = GitHubClient.parse_state_param(s)
    assert str(uid) == "42"


def test_parse_state_param_invalid_returns_none():
    assert GitHubClient.parse_state_param("not-base64!!") is None


def test_extract_last_page_from_link_header():
    hdr = '<https://api.github.com/repositories/1/pulls?page=1>; rel="first", <https://api.github.com/repositories/1/pulls?page=5>; rel="last"'
    assert GitHubClient._extract_last_page_from_link_header(hdr) == 5


def test_get_headers_includes_token():
    c = GitHubClient(access_token="abc123")
    headers = c.get_headers()
    assert "Authorization" in headers and headers["Authorization"].startswith("token")
