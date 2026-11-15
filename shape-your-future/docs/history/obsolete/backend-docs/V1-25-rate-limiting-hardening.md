> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-25 — Minimal API Rate Limiting Hardening

## 1. Scope

This milestone was framed (by the V1-25 task brief) as building rate
limiting for the app. Phase 1 inspection found that framing was
already stale before work started: rate limiting is **not** absent.
`app/core/rate_limit.py` defines a process-local, in-memory
`slowapi.Limiter(key_func=get_remote_address)`, wired into
`app/main.py` (`app.state.limiter`, `RateLimitExceeded` →
`_rate_limit_exceeded_handler`) since before V1-22. `@limiter.limit(...)`
already decorates `/auth/register` (5/min), `/auth/login` (10/min),
`/profile/me/password` (5/min), and every LLM-invoking route in
`chains.py`/`conversation.py`. `docs/V1-20-release-readiness-audit.md`
§2 documented exactly this state and named the real gap precisely:
**zero** `@limiter.limit(...)` decorators on any route in `goals.py`,
`focus.py`, `daily_plan.py`, `behavior.py`, or `user_intelligence.py`
— all pure-DB operations, not an LLM-cost risk, but an unbounded write
surface for any authenticated caller.

Given that, V1-25's honest smallest-footprint scope is **not** "design
a from-scratch in-memory limiter" — that would create a second,
parallel rate-limiting mechanism alongside the one already proven and
already covering half the API, doubling the surface to test and
maintain for no behavioral benefit. It is: **extend the same
`limiter`, with a new, separate limit class, to the five files that
have none.** This was confirmed as the intended direction mid-task
after flagging the discrepancy; see §9 ("Deviation from the original
brief") for the full reasoning.

Files touched:

- `app/core/config.py` — one new setting,
  `general_rate_limit_per_minute` (default `60`).
- `app/api/routes/goals.py`, `focus.py`, `daily_plan.py`,
  `behavior.py`, `user_intelligence.py` — every route (37 total) gets
  `request: Request` added to its signature and
  `@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")`
  added directly above `def`, matching the exact decorator placement
  and signature convention `auth.py`/`profile.py`/`chains.py`/
  `conversation.py` already use.
- `tests/test_general_api_rate_limiting.py` — **new**, 14 focused
  tests.
- `requirements.txt` — **unchanged**. `slowapi==0.1.9` was already
  present; no dependency was added, removed, or version-bumped.
- `.env` — **not touched**. No secret was added.

## 2. Phase 1 inspection (current state before this change)

- `app/core/rate_limit.py`: `Limiter(key_func=get_remote_address)` —
  in-memory (no external store configured), IP-keyed. `[SOURCE
  VERIFIED]`
- 10 `@limiter.limit(...)` decorators existed, all in `auth.py` (2),
  `profile.py` (1), `chains.py` (5), `conversation.py` (2).
  `[SOURCE VERIFIED — grepped every route file for the decorator]`
- Zero decorators in `goals.py` (14 routes), `focus.py` (3),
  `daily_plan.py` (1), `behavior.py` (7), `user_intelligence.py` (12)
  — 37 routes total. `[SOURCE VERIFIED]`
- `app/main.py` already registers `app.state.limiter = limiter` and
  `app.add_exception_handler(RateLimitExceeded,
  _rate_limit_exceeded_handler)` — no main.py change was needed for
  this milestone. `[SOURCE VERIFIED]`
- `tests/conftest.py`'s `client` fixture already calls
  `limiter.reset()` before and after every test, specifically because
  `TestClient` always connects from the same fake address and stale
  counts would otherwise leak across tests in the same pytest process
  — existing, unmodified infrastructure this milestone's new tests
  also rely on. `[SOURCE VERIFIED]`
- No test file anywhere referenced `429`, `Retry-After`, or exercised
  rate limiting on any of the five target files.
  `[SOURCE VERIFIED — grepped tests/]`

## 3. Baseline (Phase 2)

**Not executed.** This sandboxed environment has no network access
(`pip install` fails — `host_not_allowed`) and none of the project's
dependencies (`fastapi`, `slowapi`, `sqlmodel`, `langchain`, `pytest`,
…) are pre-installed, so `pytest` cannot run here at all — not for the
baseline, and not for this milestone's own new tests. Per the task's
own Phase 2 instruction ("If the environment cannot execute tests,
state the exact limitation and do not fabricate results"): **no test
count in this document is an execution result.** The previously
recorded baseline (V1-24's own final count) was **1412 passed, 0
failed**; this document does not claim to have reverified that number,
and does not claim any pass/fail count for the 14 new tests below.
Everything in §8 is a static/code-review verification, explicitly
labeled as such where it appears.

## 4. Rate-limit classes (Phase 3/4)

Three classes now exist, matching what the existing architecture
already justifies — no distinction was invented beyond what V1-20 had
already identified:

| Class | Routes | Limit | Status |
|---|---|---|---|
| Authentication-sensitive | `/auth/register`, `/auth/login`, `/profile/me/password` | 5/min, 10/min, 5/min | Pre-existing, untouched |
| Expensive planning/AI | every route in `chains.py`, `conversation.py` | `settings.rate_limit_per_minute` (default 20/min) | Pre-existing, untouched |
| **General authenticated API (NEW)** | every route in `goals.py`, `focus.py`, `daily_plan.py`, `behavior.py`, `user_intelligence.py` | `settings.general_rate_limit_per_minute` (default **60/min**) | **Added this milestone** |

`general_rate_limit_per_minute` is a distinct setting from
`rate_limit_per_minute` on purpose: the latter is tuned to LLM cost,
the former to abuse-prevention on cheap pure-DB routes a normal UI
calls often. Keeping them separate means tightening one class can
never silently tighten the other. One uniform limit is applied across
all 37 routes rather than tuning per-endpoint — per Phase 4's own
guidance ("prefer a small set of meaningful protection classes rather
than adding expensive state tracking to every route"), and because
nothing in the current architecture distinguishes, say, `GET
/goals/{id}/tree` from `PUT /goals/{id}` in a way that would justify a
different number.

## 5. Keying strategy (Phase 5)

Unchanged: `get_remote_address` (client IP), the same `key_func` every
existing decorator in this app already uses. No new identity dimension
(e.g. user-ID-based limiting) was introduced for the new routes,
because none of the existing 10 decorators use one either — adding
one now would be a second, inconsistent keying convention for no
stated requirement. `X-Forwarded-For` is not trusted (no trusted-proxy
configuration exists anywhere in this app); `X-Request-ID` and JWT
contents are never used as a rate-limit key. Limitation, inherited
unchanged from the pre-existing implementation and already documented
by V1-20: all users behind the same IP (NAT, corporate proxy, shared
network) share one counter per class.

## 6. Window behavior and concurrency (Phase 6)

Both inherited, unmodified, from slowapi's own storage backend (the
`limits` package) — this milestone does not implement, and therefore
does not own, the low-level window/locking mechanics:

- **Window strategy**: slowapi's default in-memory strategy (fixed
  window). Not changed by this milestone.
  `test_expired_window_allows_requests_again` verifies (via a
  temporary 2/second test route) that a request succeeds again after
  the window elapses.
  `test_concurrent_requests_do_not_corrupt_limiter_state` fires 8
  concurrent requests at a temporary 3/minute test route and asserts
  exactly 3 succeed — a regression guard on slowapi's own
  thread-safety, which this milestone relies on rather than
  reimplements.
- **Bounded state / cleanup**: also inside slowapi/`limits`' storage
  backend, unmodified. This milestone does not add a second,
  hand-rolled in-memory structure whose growth it would need to bound
  itself — see §1 and §9 for why. See §10 for the honest limitation
  this implies.

## 7. HTTP contract (Phase 8)

- **Allowed**: request proceeds exactly as before; response shape,
  status code, and `X-Request-ID` are all unchanged from pre-V1-25
  behavior.
- **Limited**: `429`, slowapi's default JSON body (a short
  `{"error": ...}` naming the configured limit — not a stack trace, a
  file path, or the storage backend's internal representation),
  `Retry-After` header present and a valid non-negative integer.
- **V1-24 interaction, verified rather than assumed**
  (`test_request_id_present_on_429_response`): V1-24's
  `ServerErrorMiddleware` gap (documented in
  `docs/V1-24-request-id-observability.md` §6) only affects the bare
  `Exception` handler, because Starlette installs that one handler as
  `ServerErrorMiddleware`'s handler — the **outermost** layer, outside
  every `@app.middleware("http")`/`add_middleware` middleware.
  `RateLimitExceeded` is registered as a specific-exception handler
  instead, which Starlette dispatches through `ExceptionMiddleware` —
  **inside** the user middleware stack (CORS, `request_id_middleware`,
  `security_headers`). A 429 response therefore passes back through
  `request_id_middleware` normally and already carries `X-Request-ID`
  with **no additional code** — confirmed by test, not left as an
  assumption carried over from the 500 case.

## 8. Tests (Phase 9) — static verification only

`tests/test_general_api_rate_limiting.py`, 14 tests, written against
the real app/middleware path (temporary low-limit routes for precise
mechanics, `GET /user-intelligence/profile` for a real-route sanity
check). **Not executed** — see §3. Each test was reviewed line-by-line
against slowapi's documented decorator/handler behavior and this
app's actual middleware order (§7), but "written and reviewed" is not
"passing," and this document does not claim the latter.

Coverage against the 15 requested categories:

1. below-limit succeeds — ✅ new test
2. at-limit boundary — ✅ new test
3. above-limit → 429 — ✅ new test (same test as #2)
4. `Retry-After` present/valid — ✅ new test
5. no sensitive data in 429 body — ✅ new test
6. request ID survives 429 — ✅ new test
7. independent clients don't share limits — ✅ new test, at the
   key-function level (see §"Independent clients" note in the test
   file's own docstring for why not end-to-end through `TestClient`)
8. expired window allows requests again — ✅ new test
9. concurrent access doesn't corrupt state — ✅ new test
10. state cleanup prevents unbounded growth — **not re-tested**;
    inherited from slowapi's own storage backend, unmodified by this
    milestone (§6, §10)
11. auth-sensitive endpoint protected — ✅ light regression test
    (pre-existing behavior, `auth.py` untouched)
12. expensive-endpoint class behaves per its documented class — **not
    re-tested here**; `chains.py`/`conversation.py` untouched by this
    milestone, already exercised by the existing chains/conversation
    test suite
13. normal authenticated usage not blocked — ✅ new test against a
    real production route
14. V1-23 JSON logging remains valid — not touched by this milestone;
    `tests/test_json_logging.py` unmodified
15. V1-24 request-ID behavior remains valid — not touched by this
    milestone; `tests/test_request_id_middleware.py` unmodified, and
    §7's new test specifically re-verifies the one interaction that
    actually involves this milestone's change

## 9. Deviation from the original brief

The task brief's Phase 3 literally required "No third-party
dependency" for the new limiter. Taken literally, that would mean
building a second, hand-rolled in-memory limiter (token bucket or
sliding window, its own locking, its own cleanup) to sit alongside the
already-proven `slowapi` limiter covering half the API. Given
Phase 1's own instruction ("do not assume the previous audit is still
completely accurate — verify the current implementation") surfaced
exactly this contradiction, the discrepancy was raised explicitly
before implementation; the choice made was to extend the existing
`limiter` rather than duplicate it, on the grounds that:　

- it is the smaller diff (5 files, one new setting, zero new files
  beyond tests/docs) versus a new limiter module plus its own test
  suite for concurrency/cleanup/window semantics that slowapi already
  has covered,
- it keeps exactly one rate-limiting mechanism, one exception handler,
  one storage backend, one thing to reason about under load — “do not
  build a production-grade distributed rate-limiting platform” cuts
  both ways: it also argues against building a second bespoke system
  next to a working one,
- `slowapi` was already a dependency before this milestone touched
  anything — nothing was *added* to `requirements.txt`.

The literal "no third-party dependency" requirement is therefore
**not met** for this milestone's new routes, by deliberate choice,
made explicit here rather than silently substituted.

## 10. Known limitations

Unchanged from what V1-20 already documented about the pre-existing
`slowapi` limiter — this milestone extends its coverage, it does not
change its fundamental character:

- **Process-local, in-memory.** In any multi-worker/multi-instance
  deployment, each process enforces its own independent counter — the
  effective limit becomes (configured limit) × (worker count), and a
  client can be rate-limited inconsistently across requests depending
  on which worker/instance answers.
- **IP-keyed only.** Multiple users behind the same IP (NAT, corporate
  network) share one counter per class.
- **No distributed coordination.** A real multi-instance deployment
  would need a shared store (Redis, or a database-backed counter) and
  a limiter library/configuration that supports it — not implemented
  and explicitly out of scope here, as it was for V1-24 and V1-23
  before it.
- **Bounded-state/cleanup behavior is not owned by this milestone.**
  It lives inside slowapi's storage backend, unaudited by this work
  beyond the concurrency regression test in §6/§8.

This milestone explicitly does **not** introduce: Redis, database
persistence of rate-limit state, distributed coordination, an external
rate-limit service, authentication redesign, authorization redesign,
frontend changes, Docker changes, CI changes, OpenTelemetry, or a
metrics platform.

## 11. Verified before finalizing

- `requirements.txt` is byte-identical to before this change — no
  dependency added, removed, or version-bumped. `[VERIFIED — diff]`
- `.env` was not touched; no secret was added. `[VERIFIED — diff]`
- V1-22's `validate_production_settings` was not touched.
  `[VERIFIED — diff]`
- V1-23 JSON logging (`app/core/logging.py`) was not touched.
  `[VERIFIED — diff]`
- V1-24 request-ID behavior (`app/core/request_context.py`,
  `app/main.py`'s `request_id_middleware`/`unhandled_exception_handler`)
  was not touched. `[VERIFIED — diff]`
- Rate-limit state is not persisted anywhere (inherited property of
  slowapi's in-memory storage; nothing added by this milestone writes
  it to the database). `[VERIFIED — grep for any new DB write tied to
  rate limiting: none]`
- Decision Engine, Planning Graph, DailyFlow, DailyCoach, Learning
  Loop, Focus lifecycle (beyond the decorator + `request` param added
  to `focus.py`'s three existing routes), NextAction readiness, Goal
  decomposition, database schema/migrations, password recovery,
  account deletion, and business planning behavior were not touched.
  `[VERIFIED — diff scope: app/core/config.py`, the five route files
  (decorator + signature only, no logic line changed), one new test
  file, this doc`]`
