"""Unit tests for the GitHub-token re-encryption backfill script.

Pure functions (``classify_stored_token`` / ``count_tokens``) plus
``run_audit`` / ``main`` with a faked DB and key resolver — no live
Postgres or app context required.
"""

from contextlib import nullcontext
from types import SimpleNamespace

from cryptography.fernet import Fernet

import src.db.scripts.reencrypt_github_tokens as mod


class FakeApp:
    def app_context(self):
        return nullcontext()


class FakeSession:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


class FakeDb:
    def __init__(self):
        self.session = FakeSession()
        self.initialized = None

    def init_app(self, app):
        self.initialized = app


class FakeRow(SimpleNamespace):
    def __init__(self, token, user_id=1):
        super().__init__(access_token=token, user_id=user_id)


class FakeTokenModel:
    def __init__(self, rows):
        self.query = SimpleNamespace(all=lambda: rows)


def _keys():
    k1 = Fernet.generate_key().decode()
    k2 = Fernet.generate_key().decode()
    return k1, k2


def test_classify_stored_token_states():
    k1, k2 = _keys()
    assert mod.classify_stored_token("", [k1]) == "empty"
    assert mod.classify_stored_token(b"", [k1]) == "empty"
    assert mod.classify_stored_token("x", []) == "needs_relink"
    assert mod.classify_stored_token(Fernet(k1.encode()).encrypt(b"a").decode(), [k1]) == "healthy"
    assert mod.classify_stored_token(Fernet(k2.encode()).encrypt(b"a").decode(), [k1, k2]) == "needs_rotation"
    assert mod.classify_stored_token("not-a-token", [k1]) == "needs_relink"


def test_count_tokens_aggregates():
    k1, k2 = _keys()
    values = [
        Fernet(k1.encode()).encrypt(b"a").decode(),
        Fernet(k2.encode()).encrypt(b"b").decode(),
        "plain",
        "",
    ]
    counts = mod.count_tokens(values, [k1, k2])
    assert counts == {
        "total": 4,
        "healthy": 1,
        "needs_rotation": 1,
        "needs_relink": 1,
        "empty": 1,
    }


def test_run_audit_no_keys_aborts(monkeypatch):
    monkeypatch.setattr(mod, "_resolve_keys", lambda: ([], FakeApp()))
    counts = mod.run_audit(dry_run=True)
    assert counts["total"] == 0


def test_run_audit_dry_run_counts_without_writes(monkeypatch):
    k1, k2 = _keys()
    rows = [
        FakeRow(Fernet(k1.encode()).encrypt(b"t1").decode()),
        FakeRow(Fernet(k2.encode()).encrypt(b"t2").decode()),
        FakeRow("plain"),
        FakeRow(""),
    ]
    fake_db = FakeDb()
    monkeypatch.setattr(mod, "_resolve_keys", lambda: ([k1, k2], FakeApp()))
    monkeypatch.setattr(mod, "db", fake_db)
    monkeypatch.setattr(mod, "GitHubToken", FakeTokenModel(rows))

    counts = mod.run_audit(dry_run=True)

    assert counts == {
        "total": 4,
        "healthy": 1,
        "needs_rotation": 1,
        "needs_relink": 1,
        "empty": 1,
    }
    assert fake_db.session.commits == 0
    assert fake_db.initialized is not None


def test_run_audit_fix_reencrypts_rotation_rows(monkeypatch):
    k1, k2 = _keys()
    row = FakeRow(Fernet(k2.encode()).encrypt(b"t2").decode())
    fake_db = FakeDb()
    monkeypatch.setattr(mod, "_resolve_keys", lambda: ([k1, k2], FakeApp()))
    monkeypatch.setattr(mod, "db", fake_db)
    monkeypatch.setattr(mod, "GitHubToken", FakeTokenModel([row]))

    counts = mod.run_audit(dry_run=False)

    assert counts["needs_rotation"] == 1
    assert fake_db.session.commits == 1
    # rewritten under the primary key
    assert mod.classify_stored_token(row.access_token, [k1]) == "healthy"


def test_main_selects_dry_run_from_flags(monkeypatch):
    seen = []
    monkeypatch.setattr(mod, "run_audit", lambda dry_run: seen.append(dry_run) or {})
    assert mod.main([]) == 0
    mod.main(["--fix"])
    mod.main(["--fix", "--dry-run"])
    assert seen == [True, False, True]
