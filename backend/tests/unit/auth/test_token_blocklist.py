"""Unit tests for the JWT denylist / epoch-revocation module.

Redis is faked at the ``_redis`` seam so every branch (memory-only,
Redis hit, Redis failure) is exercised without a live server.
"""

import time

import pytest
from src.auth import token_blocklist as tb


class FakeRedis:
    def __init__(self):
        self.store = {}

    def setex(self, key, ttl, value):
        self.store[key] = value

    def exists(self, key):
        return 1 if key in self.store else 0

    def get(self, key):
        return self.store.get(key)


class BoomRedis:
    def setex(self, *a, **k):
        raise RuntimeError("redis down")

    def exists(self, *a, **k):
        raise RuntimeError("redis down")

    def get(self, *a, **k):
        raise RuntimeError("redis down")


@pytest.fixture(autouse=True)
def _clean_state():
    tb.reset_for_tests()
    yield
    tb.reset_for_tests()


def test_ttls_are_positive_ints():
    assert tb.access_ttl_seconds() > 0
    assert tb.refresh_ttl_seconds() > 0


def test_redis_wrapper_none_without_url(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    tb.reset_for_tests()
    assert tb._redis() is None


def test_revoke_token_memory_only_when_no_redis(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    tb.revoke_token("abc", 60)
    assert tb.is_token_revoked({"jti": "abc"}) is True


def test_revoke_token_empty_jti_is_noop(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    tb.revoke_token("", 60)
    assert tb.get_blocklist_metrics()["memory_denylist_size"] == 0


def test_revoke_token_writes_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(tb, "_redis", lambda: fake)
    tb.revoke_token("j1", 120)
    assert tb.DENYLIST_PREFIX + "j1" in fake.store


def test_is_token_revoked_empty_payload_false(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    assert tb.is_token_revoked({}) is False
    assert tb.is_token_revoked(None) is False


def test_expired_memory_entry_purged(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    tb._memory_denylist["old"] = time.time() - 1
    assert tb.is_token_revoked({"jti": "old"}) is False
    assert "old" not in tb._memory_denylist


def test_revoke_jwt_payload_variants(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    tb.revoke_jwt_payload({})
    tb.revoke_jwt_payload(None)
    tb.revoke_jwt_payload({"exp": time.time() + 100})  # no jti
    tb.revoke_jwt_payload({"jti": "e1", "exp": time.time() + 100})
    assert tb.is_token_revoked({"jti": "e1"}) is True
    tb.revoke_jwt_payload({"jti": "e2", "exp": "nope"})  # bad exp -> ttl fallback
    assert tb.is_token_revoked({"jti": "e2"}) is True
    tb.revoke_jwt_payload({"jti": "e3", "type": "refresh"})  # no exp, refresh ttl
    assert tb.is_token_revoked({"jti": "e3"}) is True


def test_revoke_all_user_tokens_and_epoch_check(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    tb.revoke_all_user_tokens(None)
    assert tb.get_blocklist_metrics()["memory_user_revokes"] == 0

    past = time.time() - 100
    tb.revoke_all_user_tokens(7)
    assert tb.is_token_revoked({"identity": {"user_id": 7}, "iat": past}) is True
    assert tb.is_token_revoked({"identity": {"user_id": 7}, "iat": time.time() + 100}) is False


def test_user_epoch_without_valid_iat_not_revoked(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    tb.revoke_all_user_tokens(9)
    assert tb.is_token_revoked({"identity": {"user_id": 9}}) is False
    assert tb.is_token_revoked({"identity": {"user_id": 9}, "iat": "bad"}) is False


def test_extract_user_id_variants():
    assert tb._extract_user_id({"identity": {"user_id": 5}}) == 5
    assert tb._extract_user_id({"identity": "u1"}) == "u1"
    assert tb._extract_user_id({"sub": "s1"}) == "s1"
    assert tb._extract_user_id({}) is None
    assert tb._extract_user_id(None) is None


def test_redis_jti_hit_promotes_to_memory(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(tb, "_redis", lambda: fake)
    fake.store[tb.DENYLIST_PREFIX + "rj"] = "1"
    assert tb.is_token_revoked({"jti": "rj"}) is True
    assert "rj" in tb._memory_denylist
    assert tb.is_token_revoked({"jti": "unknown"}) is False


def test_redis_user_epoch_path(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(tb, "_redis", lambda: fake)
    epoch = time.time() - 50
    fake.store[tb.USER_REVOKE_PREFIX + "42"] = str(epoch)
    assert tb.is_token_revoked({"identity": {"user_id": 42}, "iat": epoch - 10}) is True
    assert tb.is_token_revoked({"identity": {"user_id": 42}, "iat": epoch + 10}) is False


def test_redis_user_epoch_bad_value(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(tb, "_redis", lambda: fake)
    fake.store[tb.USER_REVOKE_PREFIX + "43"] = "garbage"
    assert tb.is_token_revoked({"identity": {"user_id": 43}, "iat": 1}) is False


def test_redis_write_failure_fail_open_keeps_memory(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: BoomRedis())
    tb.revoke_token("bf", 60)
    tb.revoke_all_user_tokens(1)
    assert tb.get_blocklist_metrics()["backend_errors"] == 2
    assert tb.is_token_revoked({"jti": "bf"}) is True


def test_redis_read_failure_falls_back_to_memory(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: BoomRedis())
    assert tb.is_token_revoked({"jti": "x"}) is False
    assert tb.get_blocklist_metrics()["backend_errors"] >= 1

    tb._memory_denylist["y"] = time.time() + 100
    assert tb.is_token_revoked({"jti": "y"}) is True


def test_reset_for_tests_clears_state(monkeypatch):
    monkeypatch.setattr(tb, "_redis", lambda: None)
    tb.revoke_token("z", 60)
    tb.revoke_all_user_tokens(1)
    tb.reset_for_tests()
    assert tb.get_blocklist_metrics() == {
        "backend_errors": 0,
        "memory_denylist_size": 0,
        "memory_user_revokes": 0,
    }
