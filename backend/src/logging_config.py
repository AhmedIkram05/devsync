"""JSON log format for GMP Cloud Logging (stdlib only)."""

import json
import logging
import logging.config
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "severity": record.levelname,
            "msg": record.getMessage(),
            "logger": record.name,
            # getattr default: records logged outside a request (boot,
            # background jobs) carry "-" instead of raising.
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload)


class RequestIdFilter(logging.Filter):
    """Copies the active Flask request ID onto every log record, so the
    JSON logs are correlatable per request in Cloud Logging."""

    def filter(self, record):
        try:
            from flask import g, has_request_context

            record.request_id = g.get("request_id", "-") if has_request_context() else "-"
        except Exception:
            record.request_id = "-"
        return True


def setup_json_logging(level="INFO"):
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"json": {"()": "src.logging_config.JsonFormatter"}},
            # stdout (not stderr): GKE tags every stderr line ERROR regardless
            # of real severity, which floods Cloud Logging with false errors.
            # JSON lines on stdout with a top-level "severity" key are parsed
            # and promoted to the true severity by Cloud Logging.
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "json",
                    "stream": "ext://sys.stdout",
                    "filters": ["request_id"],
                }
            },
            "filters": {"request_id": {"()": "src.logging_config.RequestIdFilter"}},
            "root": {"handlers": ["default"], "level": level},
        }
    )
