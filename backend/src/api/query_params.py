"""Shared pagination + sort helpers for list endpoints.

Every list GET keeps returning its collection under the same key as before
(``{"tasks": [...]}``) and adds a ``pagination`` object next to it, so existing
clients keep working while the underlying query is hard-capped.
"""

DEFAULT_PER_PAGE = 100
MAX_PER_PAGE = 100
MAX_SEARCH_LEN = 100


def _as_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def get_pagination_args(default_per_page=DEFAULT_PER_PAGE, max_per_page=MAX_PER_PAGE):
    """Read ``page``/``per_page`` from the request, clamped to sane bounds."""
    from flask import request

    page = _as_int(request.args.get("page", 1), 1)
    per_page = _as_int(request.args.get("per_page", default_per_page), default_per_page)
    if page < 1:
        page = 1
    if per_page < 1:
        per_page = default_per_page
    return page, min(per_page, max_per_page)


def paginate(query, page, per_page):
    """Return ``(items, meta)`` for a query, falling back for materialized lists.

    Uses SQLAlchemy ``.paginate()`` when available (same call the audit and
    report endpoints already use); slices a plain list otherwise.
    """
    if hasattr(query, "paginate"):
        result = query.paginate(page=page, per_page=per_page, error_out=False)
        items = result.items
        total = result.total
        pages = result.pages
    else:
        materialized = list(query)
        total = len(materialized)
        start = (page - 1) * per_page
        items = materialized[start : start + per_page]
        pages = (total + per_page - 1) // per_page if per_page else 0
    return items, {"page": page, "per_page": per_page, "total": total, "pages": pages}


def clean_search(value, max_len=MAX_SEARCH_LEN):
    """Trim a search term; return ``None`` for blank input."""
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    return value[:max_len] or None


def resolve_sort(sort_value, allowed, default=None):
    """Map a whitelisted sort token to ``(column, descending)``.

    ``sort=-created_at`` is newest-first. Unknown tokens fall back to
    ``default`` so a bad parameter never 500s.
    """
    if not sort_value:
        sort_value = default
    if not sort_value:
        return None, False
    descending = sort_value.startswith("-")
    field = sort_value[1:] if descending else sort_value
    column = allowed.get(field)
    if column is None:
        return None, False
    return column, descending


def apply_sort(query, sort_value, allowed, default=None):
    """Apply a whitelisted ``ORDER BY`` to ``query`` (no-op for bad tokens)."""
    column, descending = resolve_sort(sort_value, allowed, default)
    if column is None:
        return query
    return query.order_by(column.desc() if descending else column.asc())
