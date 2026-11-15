"""
V1-25 - Minimal API Rate Limiting Hardening (general authenticated API
traffic: the pure-DB routes in profile.py / daily_entry.py / coach.py).

Phase 1 of this milestone found rate limiting was NOT absent from the
app - `app/core/rate_limit.py` (slowapi, in-memory, `get_remote_address`
keyed) already covers `/auth/*`, `/profile/me/password`, and every
LLM-invoking route in `chains.py`/`conversation.py`, exactly as
docs/V1-20-release-readiness-audit.md documented. The actual gap V1-20
flagged was narrower: goals/focus/daily_plan/behavior/user_intelligence
had zero `@limiter.limit(...)` decorators. This milestone closes that
gap by reusing the SAME `limiter` (no new dependency, no second
in-memory mechanism living alongside it) with a new, separate class -
`settings.general_rate_limit_per_minute` (default 60/minute) - applied
uniformly across all 37 routes in those five files. See
docs/history/obsolete/backend-docs/V1-25-rate-limiting-hardening.md for the full design writeup.

These tests exercise the real FastAPI app/middleware/exception-handler
path (`app.main.app`), not a reimplementation - same convention as
tests/test_request_id_middleware.py. Two kinds of route are used:

  - Temporary, deliberately-low-limit routes (`_add_temp_route`/
    `_remove_temp_route`, same pattern as test_request_id_middleware.py)
    for exercising the boundary/429/Retry-After/concurrency mechanics
    precisely and fast, without needing 61 real HTTP calls against a
    production route's 60/minute default.
  - A real production route (`GET /daily-entry/today`, which carries the
    general limit and needs no fixture/setup) to confirm the decorator
    does not interfere with normal authenticated use. (Step 3: the
    /daily-plan route this used to call was removed with the rest of the dead backend.)

Why some of the 15 requested test categories are represented
differently than the others (or not as a new test at all) - see the
inline note at each one:

  - "independent clients/keys do not incorrectly share limits":
    slowapi's `TestClient` always connects from the same fake address,
    so this can't be exercised end-to-end through `client.get(...)`
    (this is exactly why `conftest.py`'s `client` fixture calls
    `limiter.reset()` before/after every test - see its own comment).
    Tested instead at the key-function level: two `Request`s built with
    different ASGI-scope client addresses produce different keys.
  - "state cleanup prevents unbounded growth": bounded-state/expiry
    behavior lives inside slowapi's own storage backend (the `limits`
    package) - unmodified, pre-existing, third-party code this
    milestone does not touch or reimplement. Not re-tested here; see
    the doc's "Known limitations" section.
  - "authentication-sensitive endpoint is protected" / "expensive
    endpoint protection behaves according to its documented class":
    both already existed before V1-25 (`/auth/register`,
    `/auth/login`, chains.py/conversation.py) and neither file was
    touched by this milestone. One light regression check is included
    below for the auth case since it shares the same `limiter`
    instance this milestone extends; the LLM-route case is left to the
    existing chains/conversation test suite (see docs).
"""
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from slowapi.util import get_remote_address
from starlette.requests import Request as StarletteRequest

from app.core.config import settings
from app.core.rate_limit import limiter
from app.main import app

# ---------------------------------------------------------------------
# Temporary routes, added/removed per-test so they never leak into
# other test modules' view of `app` - same convention as
# test_request_id_middleware.py's _add_temp_route/_remove_temp_route.
# ---------------------------------------------------------------------


def _add_temp_route(path, endpoint, methods=("GET",)):
    app.add_api_route(path, endpoint, methods=list(methods))


def _remove_temp_route(path):
    app.router.routes[:] = [r for r in app.router.routes if getattr(r, "path", None) != path]


@pytest.fixture(autouse=True)
def _clean_limiter():
    """Start AND finish every test in this file with no limiter state.

    Two kinds of state leak between tests otherwise: (1) the hit counters (limiter.reset()), and (2) the limit
    *registrations*. slowapi files a decorated function's limits under "<module>.<function name>" and EXTENDS that
    list on every decoration, so each fixture call below (all handlers are called `_handler`) would stack another
    limit onto the same key: the 3rd test sees 3/minute + 3/minute + 2/second and so on. We drop this module's keys."""
    _forget_test_limits()
    limiter.reset()
    yield
    _forget_test_limits()
    limiter.reset()


def _forget_test_limits():
    prefix = f"{__name__}."
    for registry in (limiter._route_limits, limiter._dynamic_route_limits):
        for key in [k for k in registry if k.startswith(prefix)]:
            del registry[key]


@pytest.fixture()
def low_limit_route():
    """A route limited to 3/minute - small enough to exceed in a few
    real calls, and distinct from any production limit so this test
    can't be broken by tuning `general_rate_limit_per_minute` later."""

    @limiter.limit("3/minute")
    def _handler(request: Request):
        return {"ok": True}

    path = "/__test/v1-25-low-limit"
    _add_temp_route(path, _handler)
    yield path
    _remove_temp_route(path)


@pytest.fixture()
def per_second_route():
    """A route limited to 2/second - used only for the window-expiry
    test, where a short real sleep (~1s) is simpler and just as
    reliable as plumbing an injectable clock through slowapi/limits for
    a single test (see this module's docstring)."""

    @limiter.limit("2/second")
    def _handler(request: Request):
        return {"ok": True}

    path = "/__test/v1-25-per-second"
    _add_temp_route(path, _handler)
    yield path
    _remove_temp_route(path)


@pytest.fixture()
def rl_client():
    """Bare TestClient, reset before and after - same reasoning as
    conftest.py's `client` fixture: TestClient always connects from one
    fake address, so counts must not leak across tests."""
    limiter.reset()
    with TestClient(app) as c:
        yield c
    limiter.reset()


# ---------------------------------------------------------------------
# 1. Requests below the limit succeed
# ---------------------------------------------------------------------


def test_requests_below_limit_succeed(rl_client, low_limit_route):
    for _ in range(2):
        res = rl_client.get(low_limit_route)
        assert res.status_code == 200
        assert res.json() == {"ok": True}


# ---------------------------------------------------------------------
# 2-3. Boundary behavior: exactly N requests succeed for "N/minute",
# the (N+1)th is rejected with 429.
# ---------------------------------------------------------------------


def test_request_at_limit_succeeds_request_above_limit_gets_429(rl_client, low_limit_route):
    for i in range(3):
        res = rl_client.get(low_limit_route)
        assert res.status_code == 200, f"request {i + 1}/3 (within limit) should succeed"

    over = rl_client.get(low_limit_route)
    assert over.status_code == 429


# ---------------------------------------------------------------------
# 4. Retry-After is present and valid on a 429
# ---------------------------------------------------------------------


def test_retry_after_present_and_valid_on_429(rl_client, low_limit_route):
    for _ in range(3):
        rl_client.get(low_limit_route)
    res = rl_client.get(low_limit_route)
    assert res.status_code == 429

    retry_after = res.headers.get("Retry-After")
    assert retry_after is not None
    # Must be usable as-is by a well-behaved client: a non-negative
    # integer number of seconds.
    assert int(retry_after) >= 0


# ---------------------------------------------------------------------
# 5. The 429 response body carries no sensitive/internal detail
# ---------------------------------------------------------------------


def test_429_response_body_has_no_sensitive_data(rl_client, low_limit_route):
    for _ in range(3):
        rl_client.get(low_limit_route)
    res = rl_client.get(low_limit_route)
    assert res.status_code == 429

    body_text = res.text.lower()
    # slowapi's default handler returns a plain {"error": "<limit
    # string>"} body - not a stack trace, not a file path, not the
    # storage backend's internal key/counter representation.
    for leaky_term in ("traceback", "file \"", "memorystorage", ".py", "exception"):
        assert leaky_term not in body_text, f"429 body leaked internal detail: {leaky_term!r}"


# ---------------------------------------------------------------------
# 6. X-Request-ID survives a 429 response
# ---------------------------------------------------------------------


def test_request_id_present_on_429_response(rl_client, low_limit_route):
    """V1-24's request-ID middleware only has a gap for the bare
    `Exception` handler (ServerErrorMiddleware sits OUTSIDE the user
    middleware stack - see docs/V1-24-request-id-observability.md §6).
    `RateLimitExceeded` is registered as a specific-exception handler,
    which Starlette dispatches via `ExceptionMiddleware` - INSIDE the
    user middleware stack (CORS, request_id_middleware,
    security_headers) - so a 429 response passes back through
    `request_id_middleware` normally and should already carry
    X-Request-ID with no extra code. This test exists to prove that,
    not merely assume it."""
    for _ in range(3):
        rl_client.get(low_limit_route)
    res = rl_client.get(low_limit_route, headers={"X-Request-ID": "v1-25-test-rid"})
    assert res.status_code == 429
    assert res.headers.get("X-Request-ID") == "v1-25-test-rid"


# ---------------------------------------------------------------------
# 7. Independent clients/keys do not share a limit
#
# Not exercisable end-to-end through TestClient (see module docstring
# and conftest.py's `client` fixture comment: TestClient always
# connects from the same fake address). Tested instead at the
# key-function level - the same `get_remote_address` key_func every
# existing decorator in this app already uses, unmodified.
# ---------------------------------------------------------------------


def _fake_request(client_host: str) -> StarletteRequest:
    scope = {
        "type": "http",
        "client": (client_host, 12345),
        "headers": [],
        "method": "GET",
        "path": "/",
    }
    return StarletteRequest(scope)


def test_independent_client_addresses_produce_independent_keys():
    key_a = get_remote_address(_fake_request("10.0.0.1"))
    key_b = get_remote_address(_fake_request("10.0.0.2"))
    assert key_a != key_b


# ---------------------------------------------------------------------
# 8. Expired window state allows requests again
# ---------------------------------------------------------------------


def test_expired_window_allows_requests_again(rl_client, per_second_route):
    for _ in range(2):
        res = rl_client.get(per_second_route)
        assert res.status_code == 200

    blocked = rl_client.get(per_second_route)
    assert blocked.status_code == 429

    time.sleep(1.1)  # simplest reliable approach for a 1-second window

    res = rl_client.get(per_second_route)
    assert res.status_code == 200


# ---------------------------------------------------------------------
# 9. Concurrent access does not corrupt limiter state
# ---------------------------------------------------------------------


def test_concurrent_requests_do_not_corrupt_limiter_state(rl_client, low_limit_route):
    def _call(_):
        return rl_client.get(low_limit_route).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_call, range(8)))

    assert results.count(200) == 3, f"expected exactly 3 successes for 3/minute, got {results}"
    assert results.count(429) == 5


# ---------------------------------------------------------------------
# 11. Authentication-sensitive endpoint is (still) protected
#
# Pre-existing behavior (auth.py was not touched by V1-25) - included
# as a light regression check because it shares the same `limiter`
# instance this milestone extends new decorators onto.
# ---------------------------------------------------------------------


def test_auth_register_still_rate_limited(rl_client):
    for i in range(5):
        res = rl_client.post(
            "/auth/register",
            json={"username": f"v1_25_rl_user_{i}", "password": "Secret.123@"},
        )
        assert res.status_code in (201, 400), res.text  # 400 = username validation/dup, not a limiter effect

    over = rl_client.post(
        "/auth/register",
        json={"username": "v1_25_rl_user_over", "password": "Secret.123@"},
    )
    assert over.status_code == 429


# ---------------------------------------------------------------------
# 13. Normal authenticated API behavior is not accidentally blocked
# ---------------------------------------------------------------------


def test_normal_daily_entry_usage_not_blocked(client, auth_headers):
    """Well under the 60/minute default - confirms the general limit on a
    real production route doesn't interfere with ordinary use."""
    for _ in range(10):
        res = client.get("/daily-entry/today", headers=auth_headers)
        assert res.status_code != 429
        assert res.status_code == 200


def test_general_rate_limit_default_matches_documented_value():
    """Guards the documented default (docs/history/obsolete/backend-docs/V1-25-rate-limiting-hardening.md)
    against an accidental future change to config.py."""
    assert settings.general_rate_limit_per_minute == 60


def test_retry_after_is_whole_seconds_within_the_window_on_every_429(rl_client, low_limit_route, per_second_route):
    """New in Step 4: the header is whole seconds (not an HTTP date), at least 1, at most the limit's window."""
    for _ in range(3):
        rl_client.get(low_limit_route)
    minute = rl_client.get(low_limit_route)
    assert minute.status_code == 429
    assert minute.headers["Retry-After"].isdigit()
    assert 1 <= int(minute.headers["Retry-After"]) <= 60

    for _ in range(2):
        rl_client.get(per_second_route)
    second = rl_client.get(per_second_route)
    assert second.status_code == 429
    assert 1 <= int(second.headers["Retry-After"]) <= 2
