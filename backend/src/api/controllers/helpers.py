"""Shared controller helpers."""


def safe_query_all(model):
    try:
        return model.query.all()
    except Exception:
        return []
