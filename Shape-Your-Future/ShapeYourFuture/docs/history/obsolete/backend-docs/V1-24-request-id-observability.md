> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-24 — Minimal Request-ID / Correlation-ID Middleware

## 1. Scope

Narrow observability milestone, built directly on V1-23's now-valid JSON
logging. Adds the smallest production-safe request-correlation
mechanism: every HTTP request gets a request ID, it's echoed back in
the response, and it's available to application logs emitted while
handling that request. No architecture redesign, no third-party
dependency, no tracing/metrics system.

Files touched:

- `app/core/request_context.py` — **new**. Contextvar-based storage,
  ID generation, and input validation.
- `app/main.py` — new `request_id_middleware`; `unhandled_exception_handler`
  updated to carry the request ID across the one middleware boundary it
  doesn't pass through (see §6).
- `app/core/logging.py` — new `RequestIdLogFilter`, wired into
  `setup_logging()`. `JsonFormatter` itself was **not** changed.
- `tests/test_request_id_middleware.py` — **new**, 13 focused tests.

## 2. Phase 1 inspection (current state before this change)

- `app/main.py` had two middlewares (CORS, then `security_headers`,
  both `@app.middleware("http")`/`add_middleware`) and one
  `@app.exception_handler(Exception)` handler. `[SOURCE VERIFIED]`
- `app/core/logging.py`'s `JsonFormatter` (from V1-23) formats each
  `LogRecord` as one JSON object, folding any non-standard record
  attribute in as a field, redacting secret-shaped names. `[SOURCE
  VERIFIED]`
- No request-ID / correlation-ID mechanism existed anywhere in the
  app, and no test referenced `X-Request-ID`, `request_id`, or
  `contextvars`. `[SOURCE VERIFIED — grep across app/ and tests/]`
- `tests/test_json_logging.py` (V1-23) covers `JsonFormatter` and
  `setup_logging()` directly; `tests/test_api.py` has no test that
  triggers the `Exception` handler or inspects response headers on a
  500. `[SOURCE VERIFIED]`

## 3. Baseline (Phase 2)

Full suite, before any V1-24 change: **1399 passed, 0 failed** —
matches the V1-23 baseline exactly. `[EXECUTED]`

## 4. Request-ID contract (Phase 3)

- Every incoming request gets a request ID, made available for the
  duration of that request via a `contextvars.ContextVar` (not a
  mutable global — safe under concurrent requests, since each asyncio
  task gets its own copy) and mirrored onto `request.state.request_id`.
- If the client sends a header `X-Request-ID` whose value passes
  validation (§5), that value is reused as-is.
- Otherwise a new ID is generated: `uuid.uuid4().hex` (32 lowercase hex
  characters).
- Every response — success or error — carries `X-Request-ID: <id>`.
- Implementation: `app/core/request_context.py` (`get_request_id`,
  `set_request_id`, `reset_request_id`, `generate_request_id`,
  `is_valid_request_id`) plus `request_id_middleware` in `app/main.py`,
  which sets the contextvar before `call_next`, resets it in a
  `finally`, and stamps the header on the way out. No third-party
  dependency was introduced — stdlib `contextvars`/`uuid`/`re` only.

## 5. Validation / security behavior (Phase 4)

Policy (`is_valid_request_id`): the value must be a string, 1–128
characters, containing only `A-Z a-z 0-9 _ . -`. This:

- bounds the length (rejects arbitrarily large values before they ever
  reach a log line or a response header),
- excludes control characters and newlines by construction (none of
  them match the allow-list), closing off header/log-line injection
  via a crafted `X-Request-ID`,
- comfortably covers real-world correlation ID shapes (UUIDs with or
  without hyphens, ULIDs, typical upstream-proxy IDs).

An invalid, missing, or empty incoming value is never echoed back or
logged — a fresh ID is generated instead, exactly as if no header had
been sent.

The request ID is explicitly **not** treated as authentication or
authorization (nothing in the app reads it for either purpose), and it
is never persisted to the database — it lives only in the contextvar,
`request.state`, the response header, and log lines for the duration
of the request.

## 6. Exception-path behavior (Phase 6)

This is the one genuine subtlety in the milestone, found during
Phase 7 test-writing (execution-based testing caught it; a
formatter-only/synthetic test would not have):

Starlette pulls the handler registered for the bare `Exception` class
out of the normal handler table and installs it as
`ServerErrorMiddleware`'s error handler
(`Starlette.build_middleware_stack`). `ServerErrorMiddleware` is the
**outermost** middleware — outside CORS, outside
`request_id_middleware`, outside `security_headers`. When an unhandled
exception unwinds past all of those, the response `unhandled_exception_handler`
builds is returned directly by `ServerErrorMiddleware` and **never passes
back through** `request_id_middleware`, so it would not otherwise carry
`X-Request-ID` — and by that point `request_id_middleware`'s own
`finally: reset_request_id(...)` has already cleared the contextvar, so
a log call relying on `RequestIdLogFilter` alone would emit no
`request_id` field either.

Fix: `unhandled_exception_handler` now reads the ID from
`request.state.request_id` (set early by `request_id_middleware`,
before the failing call, and unaffected by the contextvar reset since
it lives on the request/scope object instead), passes it explicitly via
`extra={"request_id": ...}` to `logger.exception(...)`, and sets
`X-Request-ID` on the `JSONResponse` itself before returning it. This
does not change the exception response's status code or JSON schema —
same `{"detail": ...}` body as before.

Verified (`test_unhandled_exception_response_and_log_share_request_id`):
response carries `X-Request-ID`, the JSON error log's `request_id`
field matches it exactly, the error log's `exc_info` field is present
and still folds into one valid JSON line, and the raw exception message
text does not appear in the response body.

## 7. Logging integration (Phase 5)

`RequestIdLogFilter` (`app/core/logging.py`) is a `logging.Filter`
attached to the handler in `setup_logging()`. On each record it calls
`get_request_id()`; if a request context is active and the record
doesn't already carry a `request_id` (the exception-path case above
sets it explicitly via `extra=`), it stamps `record.request_id`.
`JsonFormatter.format()` already emits any non-standard record
attribute as a JSON field — this loop was not touched — so
`request_id` shows up as a genuine structured field, never embedded
into the `"msg"` string. Logs emitted outside any request context
(e.g. the startup "no frontend build found" warning) are unaffected:
no `request_id` field is added, and the line is still valid JSON.

All existing V1-23 guarantees — quote/Unicode round-tripping, exception
folding, secret redaction (`REDACT_KEYS`) — go through `JsonFormatter`
unchanged and are re-verified by the new tests as well as by rerunning
`tests/test_json_logging.py` unmodified.

## 8. Tests executed and results (Phases 7–8)

New file `tests/test_request_id_middleware.py`, 13 tests, run through
the real FastAPI app (`app.main.app`) and real middleware/exception
path — not a reimplementation:

1. Missing `X-Request-ID` → a 32-char hex ID is generated and returned.
2. (same test) response carries the generated ID.
3. A valid supplied `X-Request-ID` is preserved exactly.
4. Invalid/unsafe/oversized IDs (oversized, spaces, slashes, semicolon,
   empty) are never echoed back — a fresh generated ID is returned
   instead (parametrized, 5 cases).
5. Two independent requests get two different IDs.
6. A request ID appears, as a structured `request_id` field (not in
   `"msg"`), in a log line emitted while handling the request.
7. A log emitted outside any request context stays valid JSON and
   carries no `request_id` field.
8. An unhandled exception's response and its emitted `ERROR` log share
   the same request ID; the response body stays valid JSON and leaks
   no raw exception text.
9. Existing secret redaction (`password` → `[REDACTED]`) still works.
10. Every JSON line emitted while a request context is active remains
    exactly one valid JSON object (regression guard on the V1-23
    guarantee).

Regression, run after the above:

```
tests/test_request_id_middleware.py ......  ...  13 passed
tests/test_json_logging.py (V1-23, unmodified)    23 passed
tests/test_api.py, test_security.py,
  test_production_config_enforcement.py            46 passed (combined)
full suite                                        1412 passed, 0 failed
```

**Baseline: 1399 passed, 0 failed → Final: 1412 passed, 0 failed.**
1412 − 1399 = 13 new tests, 0 regressions, 0 stale/skipped tests. No
existing test was modified or weakened.

## 9. Verified before finalizing

- No new dependency was added — `requirements.txt` is byte-identical
  to before this change.
- No secret was added; `.env` was not touched.
- V1-23 JSON logging remains valid (`tests/test_json_logging.py`
  passes unmodified; also re-verified live via
  `test_existing_json_logging_remains_valid_with_request_context_active`).
- Request IDs are not persisted anywhere (no database write touches
  them; grepped for `request_id` outside `app/core/request_context.py`,
  `app/main.py`, `app/core/logging.py`, and the new test file — no
  hits).
- Business logic (Decision Engine, Planning Graph, DailyFlow,
  DailyCoach, Learning Loop, Focus lifecycle, NextAction readiness,
  Goal decomposition), database schema/migrations, authentication,
  password recovery, rate limiting, frontend, and Docker/CI were not
  touched — `diff -rq` against the pre-change tree shows changes are
  confined to `app/core/logging.py`, `app/main.py`, the new
  `app/core/request_context.py`, and the new test file.

## 10. Known limitations / explicitly out of scope

This milestone deliberately does **not** add:

- database persistence of request IDs
- authentication or authorization semantics for `X-Request-ID`
- distributed tracing or OpenTelemetry
- frontend changes
- a metrics system
- a broader observability redesign

Additionally, and pre-existing (not introduced or fixed by V1-24):
`security_headers` and the CORS middleware have the same
`ServerErrorMiddleware`-is-outermost limitation described in §6 — an
unhandled-exception response does not pass back through them either,
so it does not carry the usual `X-Content-Type-Options` /
`X-Frame-Options` / CORS headers. This was true before this change and
is out of scope here (V1-24 only had to make the request ID itself
survive that path, which §6 addresses directly); it's noted here for
whoever picks up the next observability/hardening milestone.
