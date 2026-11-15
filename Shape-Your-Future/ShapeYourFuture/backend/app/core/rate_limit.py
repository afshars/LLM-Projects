"""Rate limiting (slowapi, in-memory, keyed by client address) and the 429 response.

Every 429 carries `Retry-After: <whole seconds>` (RFC 9110): how long until the limit window that was hit resets, at
least 1. slowapi's own header injection (`headers_enabled=True`) is NOT used: it requires every route to accept a
`response` parameter and raises otherwise. The handler below computes the value itself from the limiter's window stats.
"""
import math
import time

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


def retry_after_seconds(request: Request, exc: RateLimitExceeded) -> int:
    hit = getattr(request.state, "view_rate_limit", None)  # (RateLimitItem, key parts) set by slowapi on the hit
    try:
        item, key_parts = hit
        reset_time, _remaining = limiter.limiter.get_window_stats(item, *key_parts)
        return max(1, math.ceil(reset_time - time.time()))
    except Exception:  # unknown storage state: fall back to the whole window, never omit the header
        try:
            return max(1, int(hit[0].get_expiry()))
        except Exception:
            return 60


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        {"error": f"Rate limit exceeded: {exc.detail}"},
        status_code=429,
        headers={"Retry-After": str(retry_after_seconds(request, exc))},
    )
