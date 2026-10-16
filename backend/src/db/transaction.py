"""Request-scoped transaction management.

``@transactional`` makes a request handler's database writes one atomic unit:
the handler flushes as it builds its response and the decorator commits that
work exactly once, on a successful response. If the handler raises, the
decorator rolls back. Handlers that return an error response (status >= 400)
are not committed — they leave nothing pending anyway.

Handlers and services running inside a managed transaction must flush instead
of committing (``commit_or_flush``), so the decorator's single commit covers
every write in the request. Outside a request (cron jobs, standalone scripts)
``commit_or_flush`` commits immediately as before.
"""

import contextlib
import functools
import logging

from flask import g, has_app_context

logger = logging.getLogger(__name__)

_FLAG = "_devsync_transaction_managed"


def in_managed_transaction():
    """True while the current request is running under ``@transactional``."""
    if not has_app_context():
        return False
    try:
        return bool(getattr(g, _FLAG, False))
    except RuntimeError:  # pragma: no cover - no request context
        return False


def commit_or_flush(db):
    """Flush inside a managed transaction; commit when running standalone."""
    if in_managed_transaction():
        db.session.flush()
    else:
        db.session.commit()


def _view_db(view):
    """Resolve ``db`` from the view's own module so the decorator commits the
    same session the handler uses (test doubles patch the module attribute)."""
    return getattr(view, "__globals__", {}).get("db")


def _status_of(result):
    """HTTP status of a Flask view result (defaults to 200)."""
    if isinstance(result, tuple) and len(result) >= 2 and isinstance(result[1], int):
        return result[1]
    return 200


def transactional(view):
    """Commit a handler's writes once on success; roll it back on any raise."""

    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        db = _view_db(view)
        marked = False
        previous = False
        try:
            try:
                previous = getattr(g, _FLAG, False)
                g.__dict__[_FLAG] = True
                marked = True
            except RuntimeError:  # no app/request context (unit calls)
                pass

            result = view(*args, **kwargs)
        except Exception:
            if db is not None:
                with contextlib.suppress(Exception):
                    db.session.rollback()
            raise
        else:
            if db is not None and _status_of(result) < 400:
                db.session.commit()
            return result
        finally:
            if marked:
                with contextlib.suppress(RuntimeError):
                    g.__dict__[_FLAG] = previous

    return wrapper
