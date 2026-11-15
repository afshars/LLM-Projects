"""
Structured logging with deliberate redaction. Rule: never log a raw JWT,
password, or full LLM prompt/user free-text content - log shapes and
outcomes (lengths, ids, booleans), not the sensitive payload itself.

Emitted records must be genuinely machine-parseable JSON (one object per
line), not merely JSON-shaped text. `%(message)r` (the previous format)
uses Python's repr() - producing a single-quoted, Python-escaped string
in the "msg" field - so the overall line is not valid JSON, and an
uncaught exception's traceback was appended as raw multi-line text after
the record entirely, breaking the JSON structure. `JsonFormatter` below
builds a real dict and serializes it with `json.dumps`, folding any
exception into the same JSON object instead.
"""
import json
import logging
import sys

from app.core.request_context import get_request_id

# Extra-field names (case-insensitive substring match) that must never
# appear with their real value in a log line - only ever this marker.
REDACT_KEYS = {"password", "access_token", "authorization", "token", "secret_key", "secret", "api_key", "jwt"}

# Attribute names every stdlib LogRecord already carries - anything else
# on a record came from `logger.info(..., extra={...})` and is treated
# as a caller-supplied structured field.
_STANDARD_RECORD_ATTRS = frozenset(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys())


class JsonFormatter(logging.Formatter):
    """Formats each LogRecord as one valid JSON object.

    - "msg" is `record.getMessage()` (args already merged), not the raw
      repr'd message template.
    - Any extra field is included, redacted to "[REDACTED]" if its name
      looks secret-shaped (see REDACT_KEYS / _looks_sensitive).
    - Exception info, if present, is folded into an "exc_info" string
      field rather than appended as raw text after the JSON object.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in _STANDARD_RECORD_ATTRS:
                continue
            payload[key] = "[REDACTED]" if _looks_sensitive(key) else value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        # default=str: never let an unserializable extra value (e.g. a
        # Path or dataclass someone passes via `extra=`) break JSON
        # validity - fall back to its str() rather than raising.
        return json.dumps(payload, default=str)


def _looks_sensitive(field_name: str) -> bool:
    name = field_name.lower()
    return name in REDACT_KEYS or any(term in name for term in REDACT_KEYS)


class RequestIdLogFilter(logging.Filter):
    """Stamps the current request's correlation ID onto each LogRecord.

    A `logging.Filter` is the right tool here (rather than touching
    `JsonFormatter`): it runs before formatting, and only *sets an
    attribute* on the record. `JsonFormatter` already emits any
    non-standard record attribute as a JSON field (see its loop over
    `record.__dict__`), so `request_id` shows up as a normal structured
    field with no change to the formatter itself. Outside a request
    (e.g. startup logs) `get_request_id()` is `None` and no field is
    added, so those log lines are unaffected.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        request_id = get_request_id()
        if request_id is not None and not hasattr(record, "request_id"):
            record.request_id = request_id
        return True


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RequestIdLogFilter())
    # force=True: safe to call more than once (e.g. re-imported across
    # tests) - it replaces any previously configured handlers instead of
    # silently no-op'ing the way basicConfig does by default.
    logging.basicConfig(level=level, handlers=[handler], force=True)


def safe_preview(text: str, max_len: int = 40) -> str:
    """For log lines that need to reference user text without dumping it."""
    text = text.replace("\n", " ")
    return text[:max_len] + ("…" if len(text) > max_len else "")
