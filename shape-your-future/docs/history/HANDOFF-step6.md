# HANDOFF step6 (crash-bug fixes + global error state)
## What changed
- B1: 4 /chains/*/confirm schemas validate log_date/week_start (ISO) -> 422 instead of 500 (same string kept).
- B2: UpdateGoalRequest validates goal_type, mode, value type -> 422.
- B3: LLMNotConfigured (RuntimeError subclass) -> 503 {code: llm_not_configured}; /healthz has llm_configured.
- B4: app.ts error boundary (translated panel + Try again), global handlers + banner (main.ts), journey listeners isolated.
- B7 (client half): 2xx non-JSON -> ApiError (server / llm_unavailable).
- i18n: ui.appError (en+fa). CSS: shell.css (.app-error*, tokens + logical props only).
- AUDIT-crash-and-halfdone.md: status per item (FIXED / OBSOLETE / STILL OPEN).
## Delivered files (21)
backend: app/api/routes/user_intelligence.py, app/llm/provider.py, app/main.py, app/schemas/chains.py, tests/test_crash_regressions.py
frontend/src: api/client.ts, app.ts, main.ts, lib/app-error.ts, lib/ui/app-error.ts, lib/ui/i18n/en.ts, fa.ts, state/journey.ts, styles/shell.css
frontend/smoke: app-error, app-error-view, app-shell-errors, api-client-nonjson, journey-listener-isolation (.test.ts)
docs: AUDIT-crash-and-halfdone.md, docs/history/HANDOFF-step6.md. Deleted: none.
## Checks
- RUN: tsc --noEmit (TS 6.0.3): 0 errors besides the 10 baseline asset-import errors (vite types absent).
- RUN: i18n parity (compiled script, node): OK, en = fa = 401 values.
- RUN: py_compile of 5 backend files OK.
- RUN (custom node runner, NOT vitest): app-error 8/8, api-client-nonjson 3/3, journey-listener-isolation 1/1, app-error-view 5/5 (fake DOM); mutation check: 2 tests fail on unfixed code.
- NOT RUN: pytest (no fastapi/pydantic/pytest, no network), vitest/jsdom, vite build, npm ci, app-shell-errors.test.ts, browser, Node 20, docker.
## Not verified
- Backend tests (test_crash_regressions.py) were never executed; B1/B2/B3 fixes are unverified at runtime. The 4 known failing rate-limit tests (B5/B6) are untouched.
## Git commit message
fix: return 422/503 instead of 500, add translated global error state with retry
