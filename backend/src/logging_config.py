"""JSON log format for GMP Cloud Logging (stdlib only)."""
import json
import logging
import logging.config
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "severity": record.levelname,
            "msg": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload)


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
                }
            },
            "root": {"handlers": ["default"], "level": level},
        }
    )
