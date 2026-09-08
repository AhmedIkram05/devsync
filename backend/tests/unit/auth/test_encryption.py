# Tests for Fernet encryption-at-rest of GitHub OAuth tokens.

import pytest
from sqlalchemy import text

from src.auth.encryption import decrypt_token, encrypt_token
from src.db.models import GitHubToken, db

RAW_ACCESS_TOKEN = "gho_0123456789abcdef0123456789abcdef0123"
RAW_REFRESH_TOKEN = "ghr_0123456789abcdef0123456789abcdef0123"


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


def test_legacy_plaintext_rows_still_read(app):
    # Rows written before encryption-at-rest are passed through unchanged.
    with app.app_context():
        assert decrypt_token(RAW_ACCESS_TOKEN) == RAW_ACCESS_TOKEN


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