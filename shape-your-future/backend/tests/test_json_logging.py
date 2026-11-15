"""
V1-23 - Structured Logging & Observability Hardening.

Before this change, `setup_logging()` used the format string
`'{"ts":"%(asctime)s",...,"msg":%(message)r}'`. `%(message)r` renders
the message with Python's `repr()` - a single-quoted, Python-escaped
string - inside a field that's supposed to hold a double-quoted JSON
string. The result looked JSON-shaped but `json.loads()` on it always
failed, and an uncaught exception's traceback was appended as raw
multi-line text after the record, breaking the structure entirely.
This was V1-20's "structured logging isn't actually valid JSON"
finding, reproduced directly here before any change (see the module
docstring/report for the exact `[EXECUTED]` reproduction).

These tests exercise the real formatter and the real `setup_logging()`
/ `logging.getLogger("maketime")` path used by `app/main.py`, not a
reimplementation of the logic under test.
"""
import io
import json
import logging

import pytest

from app.core.logging import REDACT_KEYS, JsonFormatter, setup_logging


@pytest.fixture()
def captured_logger():
    """
    A logger wired to the real JsonFormatter, writing to an in-memory
    stream instead of stdout, isolated from other tests/handlers.
    """
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("v1_23_test")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.propagate = False
    yield logger, stream
    logger.handlers.clear()


def _last_line(stream: io.StringIO) -> str:
    lines = [line for line in stream.getvalue().splitlines() if line.strip()]
    assert lines, "expected at least one emitted log line"
    return lines[-1]


# ---------------------------------------------------------------------
# 1-3. Valid JSON, expected fields, quotes/unicode survive
# ---------------------------------------------------------------------

def test_normal_info_log_is_valid_json_with_expected_fields(captured_logger):
    logger, stream = captured_logger
    logger.info("normal informational message")
    parsed = json.loads(_last_line(stream))  # raises if not valid JSON
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "v1_23_test"
    assert parsed["msg"] == "normal informational message"
    assert "ts" in parsed and parsed["ts"]


def test_warning_and_error_levels_are_valid_json(captured_logger):
    logger, stream = captured_logger
    logger.warning("something to watch")
    parsed = json.loads(_last_line(stream))
    assert parsed["level"] == "WARNING"

    logger.error("something failed")
    parsed = json.loads(_last_line(stream))
    assert parsed["level"] == "ERROR"


def test_message_with_embedded_quotes_and_backslashes_round_trips(captured_logger):
    logger, stream = captured_logger
    msg = 'value was "quoted" and had a backslash \\ in it'
    logger.info(msg)
    parsed = json.loads(_last_line(stream))
    assert parsed["msg"] == msg


def test_message_with_unicode_round_trips(captured_logger):
    logger, stream = captured_logger
    msg = "unicode: héllo wörld 日本語 emoji 🚀"
    logger.info(msg)
    parsed = json.loads(_last_line(stream))
    assert parsed["msg"] == msg


def test_percent_style_args_are_merged_before_serialization(captured_logger):
    """
    Existing call sites use %-style logging (e.g. `logger.warning("no
    frontend build found at %s - API-only mode", path)`) - the merged
    message, not the raw template, must end up in the JSON "msg" field.
    """
    logger, stream = captured_logger
    logger.warning("no frontend build found at %s - API-only mode", "/some/path")
    parsed = json.loads(_last_line(stream))
    assert parsed["msg"] == "no frontend build found at /some/path - API-only mode"


# ---------------------------------------------------------------------
# 4. Exception information remains present and usable
# ---------------------------------------------------------------------

def test_exception_is_folded_into_the_json_object_not_appended_raw(captured_logger):
    logger, stream = captured_logger
    try:
        1 / 0
    except ZeroDivisionError:
        logger.exception("unhandled_error path=/api/goals")

    # The whole emitted record must still be exactly one valid JSON line -
    # a raw traceback appended after the closing brace would break this.
    line = _last_line(stream)
    parsed = json.loads(line)
    assert parsed["level"] == "ERROR"
    assert parsed["msg"] == "unhandled_error path=/api/goals"
    assert "exc_info" in parsed
    assert "ZeroDivisionError" in parsed["exc_info"]
    assert "division by zero" in parsed["exc_info"]
    # exactly one JSON object was emitted for this one log call
    assert len(stream.getvalue().strip().splitlines()) == 1


# ---------------------------------------------------------------------
# 5. Sensitive values never appear with their real value
# ---------------------------------------------------------------------

@pytest.mark.parametrize(
    "field_name",
    ["password", "access_token", "authorization", "token", "secret_key", "api_key", "jwt", "Authorization"],
)
def test_secret_shaped_extra_fields_are_redacted(captured_logger, field_name):
    logger, stream = captured_logger
    secret_value = "super-sensitive-value-should-never-appear"
    logger.info("event", extra={field_name: secret_value})
    line = _last_line(stream)
    parsed = json.loads(line)
    assert parsed[field_name.lower()] if field_name.lower() in parsed else parsed[field_name]
    # the raw secret value must not appear anywhere in the emitted line
    assert secret_value not in line
    redacted_value = parsed.get(field_name, parsed.get(field_name.lower()))
    assert redacted_value == "[REDACTED]"


def test_ordinary_extra_fields_are_not_redacted(captured_logger):
    """Redaction must be targeted, not blanket - normal fields survive."""
    logger, stream = captured_logger
    logger.info("login attempt", extra={"user_id": 42, "success": True})
    parsed = json.loads(_last_line(stream))
    assert parsed["user_id"] == 42
    assert parsed["success"] is True


def test_redact_keys_set_covers_the_documented_sensitive_fields():
    for expected in ("password", "authorization", "token", "secret_key"):
        assert expected in REDACT_KEYS


# ---------------------------------------------------------------------
# Integration: the real production path (setup_logging + "maketime")
# ---------------------------------------------------------------------

def test_setup_logging_wires_the_real_json_formatter(monkeypatch, capsys):
    """
    Exercises the actual function app/main.py calls at import time,
    against the actual "maketime" logger name it uses - not a
    reimplementation.
    """
    setup_logging()
    logger = logging.getLogger("maketime")
    logger.warning("no frontend build found at %s - API-only mode", "/app/static")

    out = capsys.readouterr().out
    lines = [line for line in out.splitlines() if line.strip()]
    assert lines
    parsed = json.loads(lines[-1])
    assert parsed["logger"] == "maketime"
    assert parsed["level"] == "WARNING"
    assert "no frontend build found at /app/static" in parsed["msg"]
