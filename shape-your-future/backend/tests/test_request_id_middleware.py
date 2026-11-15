"""
V1-24 - Minimal Request-ID / Correlation-ID Middleware.

These tests exercise the real FastAPI application (`app.main.app`) and
its actual middleware stack, real `JsonFormatter`/`setup_logging()`
path, and the real global exception handler - not a reimplementation
of the logic under test. See `docs/V1-24-request-id-observability.md`.
"""
import json
import logging
import re

import pytest
from fastapi.testclient import TestClient

from app.core.logging import setup_logging
from app.core.request_context import is_valid_request_id
from app.main import app

_HEX32_RE = re.compile(r"^[0-9a-f]{32}$")


# ---------------------------------------------------------------------
# Temporary routes used only to observe request-scoped logging and the
# unhandled-exception path. Added/removed per-test so they never leak
# into other test modules' view of `app`.
# ---------------------------------------------------------------------

def _add_temp_route(path, endpoint, methods=("GET",)):
    app.add_api_route(path, endpoint, methods=list(methods))


def _remove_temp_route(path):
    app.router.routes[:] = [
        r for r in app.router.routes if getattr(r, "path", None) != path
    ]


@pytest.fixture()
def logging_route():
    async def _log_something():
        logging.getLogger("maketime").info("v1_24_test_log_line")
        return {"ok": True}

    path = "/__test/v1-24-log"
    _add_temp_route(path, _log_something)
    yield path
    _remove_temp_route(path)


@pytest.fixture()
def raising_route():
    async def _boom():
        raise RuntimeError("v1_24_test_boom")

    path = "/__test/v1-24-raise"
    _add_temp_route(path, _boom)
    yield path
    _remove_temp_route(path)


@pytest.fixture()
def plain_client():
    """A bare TestClient - these tests don't need auth/db fixtures."""
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def error_client():
    """
    Like `plain_client`, but lets the app's own registered exception
    handler produce the response instead of TestClient re-raising the
    exception into the test - matching real server behavior.
    """
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _json_lines(text):
    return [json.loads(line) for line in text.splitlines() if line.strip()]


# ---------------------------------------------------------------------
# 1-2. No X-Request-ID sent -> one is generated and returned
# ---------------------------------------------------------------------

def test_missing_request_id_is_generated_and_returned(plain_client):
    res = plain_client.get("/healthz")
    assert res.status_code == 200
    generated = res.headers.get("X-Request-ID")
    assert generated is not None
    assert _HEX32_RE.match(generated), f"expected a generated hex id, got {generated!r}"


# ---------------------------------------------------------------------
# 3. A valid client-supplied X-Request-ID is preserved
# ---------------------------------------------------------------------

def test_valid_supplied_request_id_is_preserved(plain_client):
    supplied = "client-supplied-id-123"
    assert is_valid_request_id(supplied)
    res = plain_client.get("/healthz", headers={"X-Request-ID": supplied})
    assert res.headers.get("X-Request-ID") == supplied


# ---------------------------------------------------------------------
# 4. Invalid/unsafe/oversized request IDs are not blindly propagated
# ---------------------------------------------------------------------

@pytest.mark.parametrize(
    "bad_id",
    [
        "a" * 200,  # oversized
        "has spaces in it",  # disallowed character
        "slashes/are/not/allowed",
        "semi;colon",
        "",  # empty header value
    ],
)
def test_invalid_request_id_is_not_echoed_back(plain_client, bad_id):
    assert not is_valid_request_id(bad_id)
    res = plain_client.get("/healthz", headers={"X-Request-ID": bad_id})
    returned = res.headers.get("X-Request-ID")
    assert returned != bad_id
    assert _HEX32_RE.match(returned), f"expected a freshly generated id, got {returned!r}"


# ---------------------------------------------------------------------
# 5. Independent requests get independent IDs
# ---------------------------------------------------------------------

def test_two_requests_get_independent_ids(plain_client):
    first = plain_client.get("/healthz").headers["X-Request-ID"]
    second = plain_client.get("/healthz").headers["X-Request-ID"]
    assert first != second


# ---------------------------------------------------------------------
# 6. The request ID shows up in a log emitted during the request, as a
#    structured field (not embedded into the message string)
# ---------------------------------------------------------------------

def test_request_id_appears_in_log_emitted_during_request(plain_client, logging_route, capsys):
    setup_logging()  # rebind the handler to pytest's currently-captured stdout
    capsys.readouterr()  # discard anything buffered from setup_logging() itself

    res = plain_client.get(logging_route)
    assert res.status_code == 200
    response_request_id = res.headers["X-Request-ID"]

    out = capsys.readouterr().out
    records = _json_lines(out)
    matching = [r for r in records if r.get("msg") == "v1_24_test_log_line"]
    assert matching, f"expected the test log line, got: {records}"
    record = matching[-1]
    assert record["request_id"] == response_request_id
    # it must be a real structured field, not baked into the message text
    assert record["request_id"] not in record["msg"]


# ---------------------------------------------------------------------
# 7. A log emitted outside any request context stays valid JSON and has
#    no request_id field
# ---------------------------------------------------------------------

def test_log_outside_request_context_has_no_request_id(capsys):
    setup_logging()
    capsys.readouterr()

    logging.getLogger("maketime").info("v1_24_outside_request_context")

    out = capsys.readouterr().out
    records = _json_lines(out)
    matching = [r for r in records if r.get("msg") == "v1_24_outside_request_context"]
    assert matching
    assert "request_id" not in matching[-1]


# ---------------------------------------------------------------------
# 8. Unhandled exception: response and emitted error log share the same
#    request ID; exception response stays valid JSON; nothing sensitive
#    is leaked
# ---------------------------------------------------------------------

def test_unhandled_exception_response_and_log_share_request_id(error_client, raising_route, capsys):
    setup_logging()
    capsys.readouterr()

    res = error_client.get(raising_route, headers={"X-Request-ID": "exc-path-test-id"})
    assert res.status_code == 500
    response_request_id = res.headers["X-Request-ID"]
    assert response_request_id == "exc-path-test-id"

    body = res.json()  # must still be valid JSON
    assert "v1_24_test_boom" not in json.dumps(body)  # no raw exception text leaked to client

    out = capsys.readouterr().out
    records = _json_lines(out)
    error_records = [r for r in records if r.get("level") == "ERROR"]
    assert error_records
    error_record = error_records[-1]
    assert error_record["request_id"] == response_request_id
    assert "exc_info" in error_record
    assert "RuntimeError" in error_record["exc_info"]


# ---------------------------------------------------------------------
# 9-10. Existing V1-23 behavior (redaction, JSON validity) is untouched
# ---------------------------------------------------------------------

def test_existing_secret_redaction_still_works(capsys):
    setup_logging()
    capsys.readouterr()

    logging.getLogger("maketime").info("login event", extra={"password": "super-secret-value"})

    out = capsys.readouterr().out
    assert "super-secret-value" not in out
    records = _json_lines(out)
    matching = [r for r in records if r.get("msg") == "login event"]
    assert matching
    assert matching[-1]["password"] == "[REDACTED]"


def test_existing_json_logging_remains_valid_with_request_context_active(plain_client, logging_route, capsys):
    """
    A belt-and-suspenders check that adding request-id support didn't
    regress the core V1-23 guarantee: every emitted line, even while a
    request context is active, is exactly one valid JSON object.
    """
    setup_logging()
    capsys.readouterr()

    plain_client.get(logging_route)

    out = capsys.readouterr().out
    lines = [line for line in out.splitlines() if line.strip()]
    assert lines
    for line in lines:
        json.loads(line)  # raises if any line isn't valid JSON
