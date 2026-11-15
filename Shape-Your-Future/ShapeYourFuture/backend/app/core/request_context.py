"""
Minimal request-correlation context (V1-24).

Holds the current request's correlation ID in a `contextvars.ContextVar`
rather than a mutable global, so it stays correct under concurrent
requests (each `asyncio` task - and therefore each in-flight request -
gets its own copy). Stdlib only, no third-party dependency.

This module intentionally does nothing else: no auth, no persistence,
no tracing. See `docs/V1-24-request-id-observability.md`.
"""
import re
import uuid
from contextvars import ContextVar, Token
from typing import Optional

# Client-supplied `X-Request-ID` values are attacker-controlled input -
# they end up in response headers and in JSON logs, so they're validated
# with an allow-list rather than trusted as-is. This also rules out
# newlines/control characters (header/log-line injection) for free,
# since none of them match `\w`, `-`, or `.`.
_MAX_REQUEST_ID_LENGTH = 128
_VALID_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")

_request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


def is_valid_request_id(value: str) -> bool:
    """True iff `value` is safe to echo back and to write into logs.

    Policy: 1-128 chars, ASCII letters/digits/`_`/`.`/`-` only. This
    covers UUIDs (with or without hyphens) and most upstream
    proxy/load-balancer correlation ID formats while rejecting anything
    long enough to be abusive or containing characters that could break
    a log line or a header.
    """
    if not isinstance(value, str):
        return False
    if not value or len(value) > _MAX_REQUEST_ID_LENGTH:
        return False
    return bool(_VALID_REQUEST_ID_RE.match(value))


def generate_request_id() -> str:
    """A new random ID, used whenever the client didn't send a valid one."""
    return uuid.uuid4().hex


def get_request_id() -> Optional[str]:
    """The current request's ID, or `None` outside a request context."""
    return _request_id_var.get()


def set_request_id(value: str) -> Token:
    """Bind `value` as the current request's ID. Returns a reset token."""
    return _request_id_var.set(value)


def reset_request_id(token: Token) -> None:
    """Undo `set_request_id`, restoring the previous (or empty) context."""
    _request_id_var.reset(token)
