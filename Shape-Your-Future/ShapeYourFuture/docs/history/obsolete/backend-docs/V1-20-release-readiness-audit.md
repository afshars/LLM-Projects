> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-20 — Release Readiness Audit

Status: **read-only audit. No production code, test, or prior
documentation file was modified.** This is the only file this
milestone adds.

## 0. Method note (per this milestone's own constraint)

Every finding below is tagged:

- **[EXECUTED]** — actually run in this sandbox and its real output
  shown or described (pure stdlib only — no project dependency was
  available; see §7).
- **[SOURCE]** — established by reading/tracing the actual current
  repository files, quoted or line-referenced.
- **[NOT VERIFIED]** — could not be checked at all in this sandbox
  (no dependencies, no network, no running server); named explicitly
  rather than assumed either way.

No pytest run occurred and none is claimed. This audit does not
re-litigate whether V1-17/V1-18's source-level conclusions are
correct — it treats the repository as it stands today as authoritative,
and where this audit's own inspection touches the same files, it
re-confirms them independently rather than citing the old reports.

## 1. Product V1 scope audit — the actual user journey

**Implemented, and provably journeys end-to-end through the real HTTP
API [SOURCE — confirmed by reading `tests/test_minimum_viable_user_journey.py`
end to end, not merely trusting its existence]:**

```
register → PUT /user-intelligence/profile (active_hours)
  → POST /goals → POST /goals/{id}/convert-to-project
  → POST /goals/projects/{id}/split-into-milestones
  → POST /goals/milestones/{id}/convert-to-tasks
  → POST /goals/tasks/{id}/convert-to-next-action (importance/energy/difficulty supplied)
  → GET /daily-plan → POST /focus/start → POST /focus/finish
  → POST /focus/feedback → GET /daily-plan (re-plan, task still eligible)
```

This is real: the test drives it through the public API only, reads
IDs back out of HTTP responses, and asserts the loop actually
re-enters. This is the strongest evidence in the repository that the
backend delivers a working V1 loop.

**Partially implemented — the "smart shortcut" is a product dead end,
by design, and still is today [SOURCE]:** `POST /goals/{id}/decompose`
(`app/api/routes/goals.py` line ~181, calling `engine.auto_decompose`)
is the one-call convenience path a real user would reach for instead
of six manual calls. Per `next_action_mapper.py`'s "no silent
defaults" contract, every NextAction it creates has
`importance`/`energy_required`/`difficulty` left `None` — and
`evaluate_next_action_readiness()` (the same function `/daily-plan`
and `/focus/start` both call, per V1-16B) requires all three to be
non-`None` to be plannable. **The capability to fix this after the
fact does exist** — `PUT /goals/next-actions/{id}/planning`
(`app/api/routes/goals.py` line ~239, added at V1-15) accepts exactly
these three fields on an already-created NextAction — but:

  * `POST /goals/{id}/decompose`'s own response
    (`DecomposeResponse` — `app/schemas/goals.py`) never signals which
    of the NextActions it just created need this follow-up, or that
    any follow-up is needed at all.
  * There is no bulk/batch variant of `PUT .../planning` — a decompose
    that creates N NextActions needs N separate follow-up calls.
  * `tests/test_minimum_viable_user_journey.py`'s own module docstring
    — still, today — states in the present tense *"there is no API to
    set those fields on a NextAction after creation"*, which is now
    **false** (V1-15 added exactly that API one milestone after this
    docstring was written) but was never corrected. This is itself a
    small, separate finding: a test file's own documentation has gone
    stale relative to the current repository, echoing the exact class
    of drift V1-18 found and fixed in assertions — here it's only in
    prose, so nothing is actually broken, but it is misleading to a
    future reader deciding whether this gap is real.

  **Net effect for release readiness:** a real user who uses the
  one-call decompose path — the one that looks like the "AI does it
  for you" flow the product's name promises — gets goals that silently
  cannot be planned until they, or a client built with specific
  knowledge of this contract, separately patch every created
  NextAction. Nothing in the API surface teaches a client this is
  necessary. This is the single most product-relevant gap this audit
  found: the backend is technically correct and intentional here
  (V1-14 confirmed the two-stage lifecycle is deliberate), but nothing
  connects the dots for a caller, which is a release-readiness gap
  even though it is not a bug.

**Internal-only / not exposed as a product surface [SOURCE]:**
`app/services/decision_trace.py`'s `DecisionTrace` and the "Path A"
(`plan_propose`/`plan_confirm`) `decision_id`/`highlight_task_id`
identity fields are generated and (per V1-18's audit) now returned in
`PlanningProposeResponse`, but there is no route that lets a client
ever look a `decision_id` back up — no `GET /decisions/{id}` or
equivalent. It is write-only from the client's perspective: useful for
future audit/debugging, not yet a usable product feature.

## 2. API surface audit

Full route inventory (39 endpoints across 9 routers), obtained by
grepping every `@router.(get|post|put|delete)` decorator in
`app/api/routes/` **[SOURCE]** — not reconstructed from memory or
prior docs.

**Consistently good:**
- **Ownership isolation is systematic.** Every goal-hierarchy route
  goes through one of five `_get_owned_*()` helpers in `goals.py`
  (lines 56–90) that check `row.user_id != user.id` before returning
  anything; `conversation.py` does the equivalent check inline for
  both `/continue` and `GET /{id}`. No route was found that reads
  another user's row by numeric/opaque ID without an ownership check.
  **[SOURCE — read every route file, not sampled.]**
- **Input validation bounds are real and specific**, not just
  "required": e.g. `GoalCreateRequest.title` (1–200 chars),
  `ConvertTaskToNextActionRequest.estimated_minutes` (1–180),
  `importance`/`energy_required`/`difficulty` (1–5), avatar upload
  capped at 300 KB raw bytes with a strict `data:` URI regex
  (`app/api/routes/profile.py`). **[SOURCE]**
- Password policy and username format are enforced server-side with
  clear, specific rules (`app/core/security.py`,
  `app/api/routes/auth.py`), not left to the client.

**Gaps found:**
- **No pagination anywhere.** Every list endpoint (`GET /goals`,
  `GET /behavior/task-failures`, `GET /behavior/distractions`,
  `GET /user-intelligence/distractions`, …) returns the user's
  complete row set with no `limit`/`offset`/cursor. For V1 usage this
  is invisible; it becomes a real response-size/latency problem the
  moment any single user accumulates a few thousand rows in one of
  these tables. **[SOURCE]**
- **Rate limiting is inconsistent, not absent — but has a real gap.**
  10 `@limiter.limit(...)` decorators exist total, covering
  `/auth/register`, `/auth/login`, `/profile/me/password`, and every
  LLM-invoking route in `chains.py` and `conversation.py`. **Every
  route in `goals.py`, `focus.py`, `daily_plan.py`, `behavior.py`, and
  `user_intelligence.py` has zero rate limiting** — all pure-DB
  operations, so not an LLM-cost risk, but still an unbounded write
  surface for any authenticated (or, for `/auth/*`, unauthenticated)
  caller. **[SOURCE — grepped every route file for the decorator.]**
- **`slowapi`'s limiter is in-process, in-memory
  (`app/core/rate_limit.py`: `Limiter(key_func=get_remote_address)`,
  no external store configured).** In any multi-worker/multi-instance
  deployment, each process enforces its own independent counter — the
  effective limit becomes (configured limit) × (worker count), and a
  client can also be rate-limited inconsistently across requests
  depending on which worker/instance answers. **[SOURCE]** Whether the
  actual deployment target runs multiple workers is **[NOT
  VERIFIED]** — no Dockerfile/process manager config is present in
  this archive to check (§6).
- **No API versioning.** Every route is unprefixed (`/goals`,
  `/auth`, …, not `/v1/goals`). A future breaking change has no
  side-by-side path for existing clients. **[SOURCE]**
- **Error message language is inconsistent.** The overwhelming
  majority of `HTTPException.detail` strings are Persian (matching the
  product's apparent target audience), but
  `app/api/routes/conversation.py`'s two "conversation not found"
  errors are the only English ones in the entire route surface, and
  FastAPI/Pydantic's own default validation-error responses (HTTP 422
  for a malformed request body) are always in English regardless.
  **[SOURCE — grepped every `detail=` string in `app/api/routes/`.]**
  A client cannot assume error text is in one language.
- **Validation is not symmetric between create and update on at least
  one field.** `GoalCreateRequest.horizon` has a `@field_validator`
  restricting it to `daily|weekly|long_term`
  (`app/schemas/goals.py` line ~24); `GoalUpdateRequest.horizon` (line
  ~34) has no such validator at all — `PUT /goals/{id}` can silently
  set `horizon` to any string. Minor (a display-only field, not read
  by any planning logic per a `grep` of `horizon` usage outside these
  two schemas), but real. **[SOURCE]**

## 3. Persistence

- **No real migration tool.** `app/db/database.py`'s own comment
  states it plainly: *"This project has no real migration tool
  (Alembic etc.)"*. Schema evolution is a hand-maintained list of
  `(column_name, ALTER TABLE ... ADD COLUMN ...)` tuples
  (`_USER_COLUMN_MIGRATIONS`, `_NEXT_ACTION_COLUMN_MIGRATIONS`,
  `_DAILY_LOG_COLUMN_MIGRATIONS`, `_FOCUS_SESSION_COLUMN_MIGRATIONS`),
  applied via `PRAGMA table_info` + conditional `ALTER TABLE`,
  additive-only (no column removal/rename/type-change path exists at
  all). **[SOURCE]**
- **This migration path is SQLite-only, by an explicit early return:**
  `_migrate_existing_tables()`'s first line is `if not
  settings.database_url.startswith("sqlite"): return`. Combined with
  **no Postgres driver anywhere in `requirements.txt`** (checked
  directly — no `psycopg2`/`psycopg`/`asyncpg` entry exists)
  **[SOURCE, confirmed by direct grep]**, `config.py`'s own comment
  ("swap to postgres when it matters") describes a path that is not
  actually usable today without first adding a driver dependency, and
  that even once added would silently skip every one of these four
  migrations on a fresh Postgres deployment (safe for a brand-new DB,
  where `create_all()` already creates the current full schema, but a
  real trap for anyone who deploys to Postgres, runs for a while on an
  older schema, and only then pulls in a version of this code with a
  new column added the same "manual ALTER" way).
- **SQLite itself is a single-writer store.** Fine for one process,
  a real ceiling for horizontal scaling — not a defect at V1's likely
  scale, but a concrete, load-bearing assumption that isn't written
  down anywhere in the repo's own docs.

## 4. Auth & account lifecycle

- Custom scrypt password hashing + hand-rolled HS256 JWT
  (`app/core/security.py`), with a clearly-written rationale (fewer
  C-extension build dependencies) and correct fundamentals: per-user
  salt, `hmac.compare_digest` for both password and signature checks
  (timing-safe), no trust in the JWT header's own `alg` field (the
  verifier always recomputes HMAC-SHA256 itself — no alg-confusion
  vector). **[SOURCE]**
- **No refresh token and no revocation/logout mechanism.** A token is
  valid, unconditionally, until its `exp` (60 minutes by default,
  `settings.access_token_expire_minutes`) — there is no server-side
  session/denylist, so a compromised token cannot be invalidated
  before it naturally expires, and a user must fully re-authenticate
  every hour with no silent renewal. **[SOURCE]**
- **No password recovery of any kind is possible, because `User` has
  no email field at all** (`app/db/models.py`'s `User` class: `id`,
  `username`, `hashed_password`, `created_at`,
  `display_name`/`bio`/`avatar_kind`/`avatar_value` — nothing else).
  A user who forgets their password has no path back into their
  account. **[SOURCE]**
- **No account deletion / data export endpoint exists anywhere in the
  API surface** (confirmed against the full 39-route inventory in
  §2) — a real gap for any deployment that needs to honor a user
  deletion request.

## 5. Error handling & configuration

- `app/main.py`'s catch-all `@app.exception_handler(Exception)`
  correctly logs server-side with a generic Persian message returned
  to the client — no stack trace or exception text ever reaches the
  response body. **[SOURCE]**
- Security headers middleware (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and
  `Strict-Transport-Security` gated to `production` only) and an
  explicit CORS allow-list (never `"*"`, per its own comment) are both
  present and reasonable. **[SOURCE]** **Neither is covered by any
  test** — `tests/test_api.py` and `tests/test_security.py` (the two
  most infra-adjacent test files) cover register/login/healthz and
  the password-hash/JWT primitives, but no test asserts a response
  actually carries these headers, or that CORS actually rejects a
  disallowed origin. **[SOURCE — read both files' full test-function
  list.]**
- `/docs`/`/redoc` are correctly disabled when `APP_ENV=production`
  (`app/main.py`), but this is also untested — no test constructs an
  app instance with `app_env="production"` to confirm the docs routes
  actually 404. **[SOURCE]**
- `validate_production_settings()` (`app/core/config.py`) enforces a
  real `SECRET_KEY` in production, but **it is never called from
  `app/main.py` or anywhere else in the application** — confirmed by
  `grep -rn validate_production_settings app` matching only its own
  definition. A production deployment with the placeholder
  `SECRET_KEY=change-me-to-a-long-random-string` (the literal value
  committed in `.env`/`.env.example`) would start up successfully and
  silently sign every JWT with a guessable key — the safety check
  exists in code but is dead code today. **[SOURCE — this is the
  audit's most concrete "looks safe, isn't wired up" finding.]**

## 6. Observability

- **The "structured" JSON logging format is not valid JSON.**
  `app/core/logging.py`'s format string is
  `'{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)r}'`
  — the `%(message)r` applies Python's `repr()` to the log message,
  producing single-quoted, Python-escaped text in the `"msg"` field
  rather than a valid JSON string. **[EXECUTED — reproduced directly
  in this sandbox with the stdlib `logging` module alone:]**

  ```
  >>> logger.info('hello world with "quotes" and unicode متن')
  {"ts":"2026-09-22 11:35:11,646","level":"INFO","logger":"test","msg":'hello world with "quotes" and unicode متن'}
  >>> json.loads(<that line>)
  json.decoder.JSONDecodeError: Expecting value: line 1 column 70 (char 69)
  ```

  Any log pipeline that expects real JSON (CloudWatch Logs Insights,
  Datadog, ELK, `jq`, …) will fail to parse every line this app emits,
  and any message containing a literal double-quote (user free text,
  which this codebase explicitly tries to log safely via
  `safe_preview()`) makes the line ambiguous even to a lenient
  parser. This is a genuine, reproducible defect in the logging setup
  — not a stale test, not a tooling artifact — though it is
  observability tooling, not user-facing behavior, and was explicitly
  out of this audit's "do not fix" scope.
- **No request/correlation ID.** Nothing in `app/main.py`'s middleware
  attaches a per-request id to either the log lines or the response
  headers, so correlating "this specific failed request" across a log
  stream, especially under concurrent load, is not possible today.
  **[SOURCE]**
- **`/healthz` is shallow.** It returns `{"status": "ok", "env":
  ...}` unconditionally — it does not touch the database or any other
  dependency, so a broken DB connection would still report healthy.
  **[SOURCE]**
- **No metrics endpoint or APM integration of any kind** (no
  `/metrics`, no Prometheus client, no APM SDK in `requirements.txt`).
  **[SOURCE]**

## 7. Deployment prerequisites

- **This archive is backend-only, and — critically — the artifacts it
  itself references for deployment are not in it.**
  `docker-entrypoint.sh`'s own comment refers to *"the root
  Dockerfile's node stage"* and `app/main.py` mounts a static frontend
  build at `app/static` with a graceful "API-only mode" fallback if
  it's absent. **Neither a `Dockerfile` nor any `frontend/` directory
  exists anywhere in this archive** — confirmed by a full recursive
  listing of every file this audit received. **[EXECUTED — `find` over
  the whole archive.]** This means: the deployment process this
  codebase is written for (build a frontend, bake it into an image via
  a Dockerfile this repo assumes exists, run via
  `docker-entrypoint.sh`) **cannot be reproduced from what has been
  delivered to any V1 milestone so far** — every milestone from
  V1-16B through this one has only ever received the `backend/`
  subtree. This may simply mean the frontend/Dockerfile live outside
  what gets archived for these audits — but that is exactly the kind
  of assumption this audit should not make silently, so it is flagged
  explicitly: **whether a working Dockerfile/frontend exists at all,
  anywhere, is [NOT VERIFIED]** by this audit.
- **No CI configuration of any kind** (no `.github/workflows/`, no
  `.gitlab-ci.yml`, no other CI manifest) exists in this archive.
  Whether the project is run through CI elsewhere is **[NOT
  VERIFIED]**.
- **No `README`** anywhere in the archive — no onboarding document
  explaining how to install, configure, run, or deploy this backend
  outside of scattered comments in `.env.example`,
  `docker-entrypoint.sh`, and code docstrings.
- **No dependency lockfile** (`requirements.txt` pins exact versions
  for every direct dependency, which is good practice, but there is no
  `pip-compile`/`poetry.lock`/`uv.lock` output capturing the fully
  resolved transitive dependency tree) — a fresh `pip install -r
  requirements.txt` today is not guaranteed to reproduce the exact
  same transitive versions this code was last actually tested against.

## 8. Testability

- **51 test files, ~1,230 top-level `def test_...` functions**
  (parametrized cases multiply this further — consistent with V1-16B's
  historical "1354 passed" figure). **[EXECUTED — `grep -c` over every
  test file in this sandbox.]** Coverage of the core domain (goal
  hierarchy, focus lifecycle, decision engine, planning graph,
  behavioral learning) is broad and, per V1-17/V1-18's own detailed
  audits, written with real care about what each test actually proves.
- **pytest itself has still never been executed against this
  repository in this sandbox, across V1-17, V1-18, V1-19, and this
  audit.** Re-confirmed directly this session:
  **[EXECUTED]** `python3 -c "import pytest"` →
  `ModuleNotFoundError`; `pip install fastapi` →
  `403 Forbidden`/`No matching distribution found`; `apt-get update`
  → `403 Forbidden` on every Ubuntu repository host. No cached wheel,
  vendored dependency, virtualenv, or alternate package manager for
  any of `fastapi`/`sqlmodel`/`pydantic`/`pytest`/`langchain`/
  `langgraph` exists anywhere on this filesystem (re-checked this
  session). This is an environment constraint, not a repository one —
  see V1-19's own report for the identical finding one milestone ago.
  **Every "does this pass" conclusion in this document and its
  predecessors is [SOURCE]-level, never [EXECUTED] against the real
  test suite.**
- **Coverage gaps** (things no test in the 51-file suite exercises,
  confirmed by name-searching every test file for the relevant
  behavior): security-headers middleware presence, CORS rejection
  behavior, the log-format's JSON-validity, rate-limit 429 responses
  actually firing (the fixtures' own `limiter.reset()` shows awareness
  of the limiter's existence, but nothing asserts a 429 is ever
  produced), `validate_production_settings()` (also never called in
  production code — see §5), and the static-frontend-mount fallback
  path in `main.py`. None of these are large or architecturally risky
  gaps individually, but collectively they mean the "edges" of the
  application (as opposed to its domain logic) are close to
  untested.

## 9. Summary — is this V1 release-ready?

**The domain logic — the actual Auth → Goal → … → Re-plan journey — is
real, is provably wired end-to-end through the public API, and is
backed by a genuinely large, carefully-reasoned test suite.** That
part of the release-readiness question has a solid "yes," to the
extent it can be assessed without an executable pytest run.

**The things surrounding that journey are not release-ready as a
product, independent of any bug:**

1. The one-call "decompose" convenience path — the feature most likely
   to be a new user's first real interaction — silently produces goals
   that cannot be planned, with no signal to the caller that follow-up
   is required (§1).
2. Password recovery is impossible by construction (no email field);
   there is no account deletion; JWTs cannot be revoked (§4).
3. A real production-safety check (`validate_production_settings`)
   exists but is never invoked — a production deploy with the
   committed placeholder secret key would start up cleanly (§5).
4. Structured logging silently produces invalid JSON, breaking every
   standard log-ingestion pipeline (§6, executed and reproduced).
5. Deployment cannot be reproduced from what any milestone has
   actually received — no Dockerfile, no frontend, no CI, no README
   exist in this archive, and whether they exist elsewhere is
   genuinely unverified rather than assumed (§7).
6. No pytest run has ever confirmed any of V1-16B through V1-20's
   conclusions in this environment (§8, and every prior milestone).

None of these are large architectural problems, and none require
redesigning the Decision Engine, Planning Graph, Focus lifecycle, or
Learning Loop — this audit found the existing architecture sound for
what it's built to do. They are, instead, exactly the kind of gaps
that separate "the backend technically works" from "this is honestly
release-ready" — onboarding/support/security-operations concerns that
sit around a correct core rather than inside it.

## 10. Recommended prioritization (audit only — no implementation performed)

1. Wire `validate_production_settings()` into actual startup (§5) —
   smallest possible change, closes a real silent-insecure-deploy risk.
2. Fix the logging format string so it emits valid JSON (§6) —
   mechanical, low-risk, immediately improves operability.
3. Decide and document the actual deployment story: confirm whether a
   Dockerfile/frontend/CI exist outside this archive, and if not,
   produce them, or explicitly scope this project as backend-only
   for now (§7).
4. Add either an email field + recovery flow, or a documented,
   deliberate decision that this product is username/password-only for
   V1 with recovery out of scope (§4) — currently this is silent, not
   decided.
5. Make the decompose → planning-readiness gap visible in the API
   response itself (§1) — smallest fix: have `DecomposeResponse`
   surface which NextActions still need
   `PUT .../planning`, rather than requiring a client to already know
   this contract.
6. Everything else in this document (pagination, rate-limit breadth,
   API versioning, migration tooling, request IDs, health-check depth,
   coverage gaps) is real but lower-urgency, and reasonable to track as
   a backlog rather than a release blocker.

This audit changed no code. The only new file is this document.
