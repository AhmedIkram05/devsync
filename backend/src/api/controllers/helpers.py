"""Shared controller helpers."""


def safe_query_all(model):
    """Return all rows for model, or empty list on query failure."""
    try:
        return model.query.all()
    except Exception:
        return []
