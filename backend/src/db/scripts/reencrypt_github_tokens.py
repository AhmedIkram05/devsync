"""Backfill audit for GitHub OAuth tokens encrypted at rest (P0-3).

Runbook
-------
1. Back up the database (snapshot / pg_dump) before any --fix run.
2. Set FERNET_KEYS="primary,old-key,..." (primary first) in the environment
   so this script sees the same rotation set as the app.
3. Dry run first (default)::

       python -m src.db.scripts.reencrypt_github_tokens --dry-run

   Review the printed summary: total / healthy / needs_rotation /
   needs_relink.
4. If ``needs_rotation > 0``, run::

       python -m src.db.scripts.reencrypt_github_tokens --fix

   --fix re-encrypts only rows that decrypt with a non-primary key
   (rotation lag) using the primary key. It never touches undecryptable
   rows.
5. Rows counted as ``needs_relink`` are legacy plaintext rows or corrupted
   ciphertext. Plaintext cannot be distinguished from invalid ciphertext
   (both fail Fernet decrypt), so they are NOT auto-converted. Notify the
   owning users to reconnect via the GitHub OAuth flow; the next callback
   writes fresh ciphertext.
6. Re-run --dry-run to verify needs_rotation is 0 and needs_relink only
   holds users pending manual re-link. Monitor logs for
   ``metric=github_token_decrypt_failed``.

Exit codes: 0 on success (dry-run or fix applied), 1 on config/DB error.
"""

import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from flask import Flask  # noqa: E402

try:
    from src.config.config import get_config  # noqa: E402
    from src.db.models import db  # noqa: E402
    from src.db.models.models import GitHubToken  # noqa: E402
except ImportError:  # Fallback for backend.src.* layout.
    from backend.src.config.config import get_config  # noqa: E402
    from backend.src.db.models import db  # noqa: E402
    from backend.src.db.models.models import GitHubToken  # noqa: E402

logger = logging.getLogger(__name__)


def classify_stored_token(stored_value, keys):
    """Classify one stored token value against an ordered key list.

    Returns "empty" (falsy stored), "healthy" (primary decrypts),
    "needs_rotation" (a secondary key decrypts), or "needs_relink"
    (no key decrypts: legacy plaintext or corrupted ciphertext).
    """
    if not stored_value:
        return "empty"
    if not keys:
        return "needs_relink"
    try:
        from cryptography.fernet import Fernet, InvalidToken
    except ImportError:
        logger.error("cryptography package is required for token audit")
        return "needs_relink"
    encoded = stored_value.encode("utf-8") if isinstance(stored_value, str) else stored_value
    for index, key in enumerate(keys):
        try:
            Fernet(key.encode("utf-8")).decrypt(encoded)
            return "healthy" if index == 0 else "needs_rotation"
        except (InvalidToken, ValueError):
            continue
        except Exception:
            continue
    return "needs_relink"


def count_tokens(stored_values, keys):
    """Count token states for a list of stored values (pure, testable)."""
    counts = {"total": 0, "healthy": 0, "needs_rotation": 0, "needs_relink": 0, "empty": 0}
    for value in stored_values:
        counts["total"] += 1
        counts[classify_stored_token(value, keys)] += 1
    return counts


def _resolve_keys():
    try:
        from src.auth.encryption import get_fernet_keys  # noqa: E402
    except ImportError:
        from backend.src.auth.encryption import get_fernet_keys  # noqa: E402
    app = Flask(__name__)
    app.config.from_object(get_config())
    with app.app_context():
        return list(get_fernet_keys()), app


def run_audit(dry_run=True):
    """Scan GitHubToken rows; optionally re-encrypt rotation-lag rows."""
    keys, app = _resolve_keys()
    if not keys:
        logger.error("No Fernet keys resolved; aborting audit")
        return {"total": 0, "healthy": 0, "needs_rotation": 0, "needs_relink": 0, "empty": 0}
    db.init_app(app)
    counts = {"total": 0, "healthy": 0, "needs_rotation": 0, "needs_relink": 0, "empty": 0}
    relink_user_ids = []
    with app.app_context():
        rows = GitHubToken.query.all()
        try:
            from cryptography.fernet import Fernet
        except ImportError:
            logger.error("cryptography package is required for token audit")
            return counts
        primary = keys[0]
        for row in rows:
            counts["total"] += 1
            state = classify_stored_token(row.access_token, keys)
            counts[state] += 1
            if state == "needs_relink":
                relink_user_ids.append(row.user_id)
            elif state == "needs_rotation" and not dry_run:
                plaintext = None
                for key in keys[1:]:
                    try:
                        plaintext = Fernet(key.encode("utf-8")).decrypt(row.access_token.encode("utf-8"))
                        break
                    except Exception:
                        continue
                if plaintext is not None:
                    row.access_token = Fernet(primary.encode("utf-8")).encrypt(plaintext).decode("utf-8")
        if not dry_run:
            db.session.commit()
    logger.warning(
        "github token audit dry_run=%s total=%d healthy=%d needs_rotation=%d needs_relink=%d",
        dry_run,
        counts["total"],
        counts["healthy"],
        counts["needs_rotation"],
        counts["needs_relink"],
    )
    if relink_user_ids:
        logger.warning(
            "Users needing GitHub re-link count=%d (ids withheld; notify via OAuth flow)",
            len(relink_user_ids),
        )
    print(
        "total={total} healthy={healthy} needs_rotation={needs_rotation} "
        "needs_relink={needs_relink} empty={empty}".format(**counts)
    )
    return counts


def main(argv=None):
    parser = argparse.ArgumentParser(description="Audit GitHub token encryption states.")
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--fix", action="store_true", help="Re-encrypt rotation-lag rows with primary key.")
    args = parser.parse_args(argv)
    dry_run = not args.fix or args.dry_run
    logging.basicConfig(level=logging.INFO)
    run_audit(dry_run=dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
