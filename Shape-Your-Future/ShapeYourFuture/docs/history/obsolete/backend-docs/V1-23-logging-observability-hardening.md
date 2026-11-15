> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-23 — Structured Logging & Observability Hardening

## 1. Scope

Narrow hardening milestone: make the application's structured logging
genuinely machine-parseable JSON, verified by execution rather than
visual inspection, while protecting sensitive values from ever being
logged. No architecture redesign, no third-party logging framework, no
tracing/metrics infrastructure, no Redis. Only `app/core/logging.py`
and a new focused test file were touched.

## 2. V1-20 logging finding (as originally reported)

> The "structured" JSON logging format is not valid JSON.
> `app/core/logging.py`'s format string uses `%(message)r`, which
> applies Python's `repr()` to the log message, producing
> single-quoted, Python-escaped text in the `"msg"` field rather than
> a valid JSON string. **[EXECUTED — reproduced directly in this
> sandbox with the stdlib `logging` module alone.]**

## 3. Current implementation before change (Phase 1 inspection)

Per instruction, this finding was re-verified against current source
rather than assumed to still hold (V1-22 showed a prior finding had
in fact already been resolved elsewhere in this project, so the same
care was applied here).

- `app/core/logging.py` exported one function, `setup_logging()`,
  using `logging.basicConfig(..., format='{"ts":"%(asctime)s",
  "level":"%(levelname)s","logger":"%(name)s","msg":%(message)r}')`.
  `[SOURCE VERIFIED]`
- Exactly **two** call sites use the resulting `"maketime"` logger,
  both in `app/main.py`:
  - `logger.exception("unhandled_error path=%s", request.url.path)`
    in the global exception handler — logs only the request path, no
    body, headers, or query string.
  - `logger.warning("no frontend build found at %s - API-only mode",
    _static_dir)` — a static local path, not user input.
  No other file in `app/` calls `logging.*` or `print()` at all.
  `[SOURCE VERIFIED — full grep across app/]`
- `REDACT_KEYS = {"password", "access_token", "authorization",
  "token"}` and `safe_preview()` were both defined in the file but
  **never referenced anywhere** — dead code; no redaction mechanism
  was actually wired into the logging path. `[SOURCE VERIFIED]`
- No existing test in `tests/` covered `app/core/logging.py`, the
  `"maketime"` logger, or JSON validity of any log line.
  `[SOURCE VERIFIED]`
- No request ID / correlation ID mechanism exists anywhere in the
  application (no middleware generates or attaches one).
  `[SOURCE VERIFIED]`
- Domain-level identifiers (`decision_id`, `planning_attempt_id`,
  `focus_session_id`) already exist, but only inside the Decision
  Engine / Planning Graph / DailyFlow / Focus-lifecycle data models
  and services — none of those modules perform any logging today, and
  all are explicitly out of scope for this milestone (see §9).

## 4. Runtime baseline (Phase 2, before any change)

Full suite, unmodified: **1382 passed, 0 failed** (matches the V1-22
baseline exactly). `[EXECUTED]`

Direct runtime probe of the actual (pre-change) formatter, using the
real format string from `setup_logging()` and `json.loads()` — not
visual inspection — against normal, warning, quote-containing, and
Unicode messages, plus an exception:

```
{"ts":"...","level":"INFO","logger":"probe","msg":'normal informational message'}
  -> INVALID JSON: Expecting value: line 1 column 71 (char 70)
```

All five representative cases (info, warning, embedded double-quotes,
Unicode, exception) **failed `json.loads()`** — confirming the V1-20
finding was still accurate for this specific issue.  `[EXECUTED]`

The exception case additionally showed a second, independent problem
not called out explicitly in V1-20's one-line description: `logging`
appends the formatted exception traceback as raw multi-line text
*after* the formatted record, so an exception log isn't merely
"JSON with a bad `msg` field" — the traceback text sits entirely
outside any JSON structure. `[EXECUTED]`

## 5. Root cause

`%(message)r` in a Python `logging` format *string* only ever produces
`repr()` output — there is no format-string flag that makes a
%-style logging `Formatter` emit a properly quoted/escaped JSON
string, and `%(...)`-based formatting has no hook for folding
`exc_text` into a structured field. A format string is fundamentally
the wrong tool for this; a `Formatter.format()` override that builds a
real `dict` and calls `json.dumps()` on it is required.

## 6. Changes made

`app/core/logging.py` only:

- Added `JsonFormatter(logging.Formatter)`, whose `format()` builds a
  `dict` — `ts`, `level`, `logger`, `msg` (via `record.getMessage()`,
  so existing `%s`-style call sites keep working) — and serializes it
  with `json.dumps(payload, default=str)`. `default=str` guarantees a
  valid JSON line even if a future caller passes an `extra=` value
  that isn't natively JSON-serializable (a `Path`, an enum, ...),
  rather than letting logging itself raise.
- Any `extra={...}` field on a record is included, keyed by name.
- `REDACT_KEYS` (now also including `secret_key`, `secret`, `api_key`,
  `jwt`, in addition to the four pre-existing entries) is applied to
  every extra field: if the field's name (case-insensitive, substring
  match) matches an entry, its value is replaced with the literal
  string `"[REDACTED]"` — never logged, not even truncated/partial.
  This activates the previously-dead `REDACT_KEYS` mechanism instead
  of introducing a new one.
- If `record.exc_info` is set, the formatted traceback is added as an
  `"exc_info"` **string field inside the same JSON object**, so an
  exception log is still exactly one valid JSON line.
- `setup_logging()` now builds a `StreamHandler(sys.stdout)` with
  `JsonFormatter()` explicitly and calls `logging.basicConfig(...,
  handlers=[handler], force=True)`. `force=True` was added so the
  function is safe to call more than once in the same process (e.g.
  across test runs) — it replaces any previously configured handlers
  instead of `basicConfig`'s default no-op-if-already-configured
  behavior, which could otherwise leave a stale non-JSON handler
  installed in some import orders.

No other file was modified. `app/main.py`'s two call sites are
unchanged — they didn't need to be; the fix is entirely in the
formatter they already go through.

## 7. JSON validity verification (Phase 3, post-change, `[EXECUTED]`)

Re-ran the identical probe as §4 against the new formatter:

| Case | `json.loads()` result |
|---|---|
| Normal info message | valid, `msg` round-trips exactly |
| Warning message | valid |
| Message with embedded double quotes + backslash | valid, `msg` round-trips exactly |
| Unicode (`héllo wörld 日本語 🚀`) | valid, `msg` round-trips exactly |
| `%s`-style args (`"no frontend build found at %s..."`) | valid, merged message round-trips |
| Uncaught exception via `logger.exception(...)` | valid, single JSON line, `exc_info` field contains `"ZeroDivisionError"` and `"division by zero"` |
| Extra fields incl. `password`/`authorization`/`secret_key` | valid, sensitive fields show `"[REDACTED]"`, non-sensitive fields (`user_id`) unchanged |

Additionally ran the **real** `setup_logging()` + `logging.getLogger("maketime")`
path (what `app/main.py` actually uses) with `logging`'s own record
merging, and separately exercised a live `TestClient(app)` request
through the real FastAPI app end-to-end — the static-file-missing
warning it emits on startup is a single valid JSON line.

## 8. Sensitive-data review (Phase 6)

- Source review of every `logger.*` call site in `app/` (two total, in
  `app/main.py`) confirmed neither logs a password, hash, JWT,
  Authorization header, `SECRET_KEY`, API key, or request body — one
  logs `request.url.path` only (no query string, no body), the other
  a fixed local filesystem path.
- No pre-existing violation was found to fix — the security work here
  is making the formatter itself redact-by-default for any *future*
  call site that passes `extra={...}`, since that's the boundary
  through which a password/token/secret could realistically end up in
  a log line later. `REDACT_KEYS` now actually does something.
- Verified by execution (`test_secret_shaped_extra_fields_are_redacted`,
  parametrized over `password`, `access_token`, `authorization`,
  `token`, `secret_key`, `api_key`, `jwt`, and a differently-cased
  `Authorization`): in every case the raw secret value is asserted
  **absent** from the emitted line, and the field shows
  `"[REDACTED]"`. `[EXECUTED]`
- Verified redaction is targeted, not blanket: an ordinary field like
  `user_id` is untouched. `[EXECUTED]`

## 9. Observability identifier review (Phase 5)

| Identifier | Exists today? | Where | Currently logged? | Action |
|---|---|---|---|---|
| Request ID / correlation ID | No | — | N/A | Not added. Adding one would mean new middleware in `app/main.py` wrapping every request — more than the "small correction" this milestone calls for, and no current log statement is request-scoped enough to benefit from it yet. Left as a recommendation (§14), not implemented. |
| `decision_id` | Yes | Decision Engine / Planning Graph / `decision_trace.py` | No | Not wired in — doing so requires touching the Decision Engine/Planning Graph, explicitly out of scope for V1-23. |
| `planning_attempt_id` | Yes | `daily_flow.py`, `graphs/state.py`, `graphs/planning_graph.py` | No | Same as above — DailyFlow/Planning Graph out of scope. |
| `FocusSession` ID | Yes | Focus lifecycle services/models | No | Focus lifecycle explicitly out of scope. |
| Feedback marker/session ID | Yes | `focus_feedback.py` | No | Same — out of scope. |
| User ID | Available at request time (via auth dependency) | `app/api/deps.py` | No | Not wired in; no current log call site is inside an authenticated request path. |

None of these were force-fitted in. The formatter now *supports*
adding any of them safely and legibly via `logger.info(..., extra=
{"decision_id": ...})` the moment a caller in an in-scope module wants
to — that capability is the concrete, minimal contribution of this
milestone toward observability, without touching any out-of-scope
module to consume it yet.

## 10. Tests and exact results

New file: `backend/tests/test_json_logging.py` (17 tests, all
`[EXECUTED]`), exercising the real `JsonFormatter` and the real
`setup_logging()` / `"maketime"` logger — not a reimplementation:

1. Normal info log → valid JSON, expected fields (`ts`, `level`,
   `logger`, `msg`) present and correct.
2. Warning and error levels → valid JSON.
3. Message with embedded quotes/backslashes → round-trips exactly.
4. Message with Unicode → round-trips exactly.
5. `%s`-style args (matching real call-site usage) → merged correctly
   before serialization.
6. Exception via `logger.exception(...)` → single valid JSON line,
   `exc_info` field contains the exception type and message, nothing
   appended outside the JSON object.
7. Secret-shaped extra fields (`password`, `access_token`,
   `authorization`, `token`, `secret_key`, `api_key`, `jwt`, and a
   differently-cased variant) → redacted, raw value never appears in
   the emitted line.
8. Ordinary extra fields (`user_id`, `success`) → not redacted.
9. `REDACT_KEYS` contains the documented sensitive field names.
10. Integration: `setup_logging()` + `logging.getLogger("maketime")`
    (the exact objects `app/main.py` uses) → valid JSON.

Commands run and results, this sandbox:

```
$ pytest tests/test_json_logging.py -v
17 passed

$ pytest tests/test_api.py tests/test_security.py \
         tests/test_production_config_enforcement.py \
         tests/test_json_logging.py -q
46 passed

$ pytest tests/ -q
1399 passed, 210 warnings in 44.76s
```

`1399 = 1382 (V1-22 baseline, unchanged) + 17 (new)`. **0 failed.**
Warning count (210) is identical to the V1-22 baseline — no new
warnings were introduced. `[EXECUTED]`. No test was skipped, weakened,
or modified to force a pass.

## 11. Backward compatibility

- `setup_logging()`'s public signature (`level: str = "INFO"`) is
  unchanged; every existing caller (`app/main.py`) works with no
  changes.
- The two existing call sites' behavior (what gets logged, at what
  level) is unchanged — only the *serialization* changed.
- `REDACT_KEYS` remains importable under the same name; it gained more
  entries but nothing was removed, so any external reference to it
  (there were none in-repo) keeps working.
- Full suite: 1382 pre-existing tests pass unmodified.

## 12. Remaining observability limitations

- No request ID / correlation ID exists yet — each log line stands
  alone; nothing currently ties a request's multiple log lines (there
  are none today) together across the request lifecycle.
- `decision_id`, `planning_attempt_id`, `FocusSession` ID, and
  feedback markers exist as data but are not yet logged anywhere —
  wiring them in requires touching modules this milestone was
  explicitly barred from touching.
- Redaction is name-based (matches on field *name*, not content) — a
  secret accidentally passed under an unexpected key name (e.g.
  `extra={"pw": ...}`) would not be caught. The two live call sites
  don't do this today; this is a heuristic, not a guarantee, for any
  future call site.
- No log aggregation, rotation, or shipping is configured — logs go
  to stdout only, as before.

## 13. V1 release impact

Resolves V1-20's concrete "structured logging isn't actually valid
JSON" finding, confirmed still live by direct execution before the
fix and confirmed fixed by direct execution after it, across normal
messages, quotes, Unicode, and exceptions. Additionally activates the
previously-dead `REDACT_KEYS` mechanism so any future log call that
attaches structured fields is redacted by default rather than by
each caller remembering to do it.

## 14. Recommended next milestone

Add a small, self-contained request-ID middleware (generate a UUID per
request, attach as `X-Request-ID` response header and as `extra=
{"request_id": ...}` on any log line emitted during that request) —
this was evaluated here (§9) and deliberately deferred rather than
force-fitted, since no current log call site is request-scoped enough
to use it yet and it touches `app/main.py`'s middleware stack, which
this milestone's scope treated as "only if absolutely necessary."

---

## V1-23 verdict

**PASS**

1. **Are emitted logs now valid JSON?** Yes — verified for normal,
   warning/error, quote-containing, Unicode, and exception-carrying
   log records.
2. **Was this verified by actual execution?** Yes, throughout: the
   pre-change failure was reproduced by execution (not just reading
   the format string), the post-change fix was verified by execution
   against the same cases plus the real `setup_logging()`/`"maketime"`
   path, and by the full test suite.
3. **Are sensitive values protected from logging?** Yes. No existing
   call site logged anything sensitive (source-reviewed, confirmed).
   The formatter now redacts any `extra` field whose name matches a
   password/token/secret/authorization/JWT/API-key pattern, verified
   by execution across 8 field-name variants.
4. **What V1-20 issue was resolved?** "The 'structured' JSON logging
   format is not valid JSON" — confirmed still true, then fixed and
   re-verified by execution.
5. **Were any new dependencies introduced?** No — stdlib `json` only;
   `requirements.txt` is unchanged.
6. **Did the full suite remain green?** Yes — 1399 passed (1382
   pre-existing + 17 new), 0 failed.
7. **What is the single most important next milestone?** A minimal
   request-ID middleware, so future request-scoped log lines can be
   correlated — deliberately not implemented here per the "don't force
   a middleware redesign" scope constraint.

### Changed files

- `backend/app/core/logging.py` — modified (`JsonFormatter` added;
  `setup_logging()` now uses it; `REDACT_KEYS` extended and actually
  wired in; no other line changed)
- `backend/tests/test_json_logging.py` — new (17 tests)
- `backend/docs/V1-23-logging-observability-hardening.md` — new (this
  document)

No other file was modified. `backend/docs/V1-20-release-readiness-audit.md`,
`backend/docs/V1-21-decompose-planning-contract-fix.md`, and
`backend/docs/V1-22-production-config-hardening.md` were left untouched.

### Exact test counts

- New V1-23 tests: **17 passed, 0 failed**
- Relevant existing tests (api, security, config, logging together):
  **46 passed, 0 failed**
- Full suite: **1399 passed, 0 failed** (baseline 1382 + 17 new)
