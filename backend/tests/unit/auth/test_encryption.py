# Tests for Fernet encryption-at-rest of GitHub OAuth tokens.

import os

import pytest

# Ensure config import never fails at collection when keys are unset locally.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-encryption-import-32")
os.environ.setdefault("SECRET_KEY", "test-flask-secret-for-encryption-import-32")
os.environ.setdefault("ALLOW_DERIVED_FERNET", "true")

from cryptography.fernet import Fernet
from itsdangerous import BadData, URLSafeTimedSerializer
from sqlalchemy import text
from src.auth.encryption import decrypt_token, encrypt_token, get_fernet_keys
from src.config.config import (
    derive_fernet_key,
    derive_oauth_state_secret,
    is_valid_fernet_key,
    resolve_fernet_keys,
    resolve_oauth_state_secret,
)
from src.db.models import GitHubToken, db
from src.services.github_client import GitHubClient

RAW_ACCESS_TOKEN = "gho_0123456789abcdef0123456789abcdef0123"
RAW_REFRESH_TOKEN = "ghr_0123456789abcdef0123456789abcdef0123"

TEST_JWT = "test-jwt-secret-for-encryption-unit-tests-32"
TEST_FLASK = "test-flask-secret-distinct-from-jwt-32"


def test_encrypt_decrypt_roundtrip(app):
    with app.app_context():
        encrypted = encrypt_token(RAW_ACCESS_TOKEN)

        assert encrypted is not None
        assert encrypted != RAW_ACCESS_TOKEN
        assert RAW_ACCESS_TOKEN not in encrypted

        assert decrypt_token(encrypted) == RAW_ACCESS_TOKEN


def test_encrypt_decrypt_none_values(app):
    with app.app_context():
        assert encrypt_token(None) is None
        assert encrypt_token("") is None
        assert decrypt_token(None) is None
        assert decrypt_token("") is None


def test_invalid_token_returns_none(app):
    # Fail-closed: undecryptable values never return plaintext.
    with app.app_context():
        assert decrypt_token(RAW_ACCESS_TOKEN) is None
        assert decrypt_token("not-a-fernet-token") is None
        assert decrypt_token("gho_plaintext-legacy-row") is None


def test_decrypt_failure_logs_without_secret(app, caplog):
    with app.app_context():
        with caplog.at_level("WARNING"):
            assert decrypt_token("corrupted-ciphertext", user_id=42) is None
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "corrupted-ciphertext" not in logged
    assert "gho_" not in logged


def test_token_column_holds_ciphertext_not_raw_token(app):
    with app.app_context():
        db.init_app(app)
        db.create_all()

        token_row = GitHubToken(
            user_id=1,
            access_token=encrypt_token(RAW_ACCESS_TOKEN),
            refresh_token=encrypt_token(RAW_REFRESH_TOKEN),
        )
        db.session.add(token_row)
        db.session.commit()

        stored_access = db.session.execute(
            text("SELECT access_token FROM github_tokens WHERE id = :id"), {"id": token_row.id}
        ).scalar_one()
        stored_refresh = db.session.execute(
            text("SELECT refresh_token FROM github_tokens WHERE id = :id"), {"id": token_row.id}
        ).scalar_one()

        # The DB column never contains the raw token.
        assert RAW_ACCESS_TOKEN not in stored_access
        assert RAW_REFRESH_TOKEN not in stored_refresh

        # Reads still decrypt transparently.
        reloaded = db.session.get(GitHubToken, token_row.id)
        assert decrypt_token(reloaded.access_token) == RAW_ACCESS_TOKEN
        assert decrypt_token(reloaded.refresh_token) == RAW_REFRESH_TOKEN

        db.session.remove()
        db.drop_all()


def test_distinct_keys_work(app, monkeypatch):
    new_fernet = Fernet.generate_key().decode()
    monkeypatch.setenv("SECRET_KEY", TEST_FLASK)
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.setenv("FERNET_KEY", new_fernet)
    monkeypatch.delenv("FERNET_KEYS", raising=False)
    assert TEST_FLASK != TEST_JWT
    assert new_fernet != TEST_JWT
    assert is_valid_fernet_key(new_fernet)
    with app.app_context():
        assert get_fernet_keys()[0] == new_fernet
        assert decrypt_token(encrypt_token(RAW_ACCESS_TOKEN)) == RAW_ACCESS_TOKEN


def test_missing_fernet_in_prod_raises_unless_derived_allowed(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/devsync")
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.delenv("FERNET_KEY", raising=False)
    monkeypatch.delenv("FERNET_KEYS", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("ALLOW_DERIVED_FERNET", raising=False)
    with pytest.raises(RuntimeError, match="FERNET_KEY is required"):
        resolve_fernet_keys()
    monkeypatch.setenv("ALLOW_DERIVED_FERNET", "true")
    keys = resolve_fernet_keys()
    assert len(keys) == 1
    assert is_valid_fernet_key(keys[0])


def test_hkdf_outputs_differ_per_info():
    fernet_derived = derive_fernet_key(TEST_JWT)
    oauth_derived = derive_oauth_state_secret(TEST_JWT)
    assert is_valid_fernet_key(fernet_derived)
    assert fernet_derived != oauth_derived
    assert derive_fernet_key(TEST_JWT) == fernet_derived
    assert derive_fernet_key("different-jwt-secret-32-chars-xyz") != fernet_derived


def test_rotation_old_key_still_decrypts(app, monkeypatch):
    old_key = Fernet.generate_key().decode()
    new_key = Fernet.generate_key().decode()
    assert old_key != new_key
    monkeypatch.setenv("FERNET_KEY", old_key)
    monkeypatch.delenv("FERNET_KEYS", raising=False)
    with app.app_context():
        ciphertext_with_old = encrypt_token(RAW_ACCESS_TOKEN)
    monkeypatch.setenv("FERNET_KEYS", f"{new_key},{old_key}")
    monkeypatch.delenv("FERNET_KEY", raising=False)
    with app.app_context():
        assert decrypt_token(ciphertext_with_old) == RAW_ACCESS_TOKEN
        fresh = encrypt_token(RAW_REFRESH_TOKEN)
        assert fresh is not None
        assert decrypt_token(fresh) == RAW_REFRESH_TOKEN
        assert Fernet(new_key).decrypt(fresh.encode()).decode() == RAW_REFRESH_TOKEN


def test_oauth_state_uses_derived_key_not_raw_jwt(app, monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT)
    monkeypatch.delenv("OAUTH_STATE_SECRET", raising=False)
    derived = resolve_oauth_state_secret(jwt_secret=TEST_JWT)
    assert derived != TEST_JWT
    assert derived == derive_oauth_state_secret(TEST_JWT)
    with app.app_context():
        state = GitHubClient.create_state_param("user-123")
        assert GitHubClient.parse_state_param(state) == "user-123"
        raw_serializer = URLSafeTimedSerializer(TEST_JWT, salt="github-oauth-state")
        with pytest.raises(BadData):
            raw_serializer.loads(state, max_age=600)
