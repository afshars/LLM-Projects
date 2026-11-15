# HANDOFF Step 4 (timezone, rate limit, docs)
(name differs from the older `HANDOFF-step4.md`, which is the earlier "delete Plan area" step)
## What changed
- ONE user-day helper `app/api/day.py` (`?day=` or `X-Timezone`, else UTC); Coach and daily-entry routes use it; frontend sends `X-Timezone`.
- Own 429 handler with `Retry-After` (seconds); autouse limiter-reset fixture in the rate-limit tests (assertions unchanged).
- Root cause of the order-dependence: slowapi keys limits by `module.funcname` and extends the list on every decoration; all fixture handlers were `_handler`. See AUDIT.md section 4.
- Docs 00/07/08/10 rewritten; old ones + `backend/docs/*` moved to `docs/history/obsolete/`; README, 09-smoke-test, AUDIT.md updated.
## Checks
- RUN: pytest 216 passed (before: 199 passed, 6 failed); rate-limit file 3x green; mutation check on the day helper; tsc, build, check:i18n OK; vitest 178 passed; compileall OK.
- NOT RUN: full `pip install -r requirements.txt` (resolver timed out; langchain/langgraph/uvicorn not installed, unused by tests), Docker, browser smoke test, real LLM.
## Open / flagged
- AUDIT rows 19 (profile routes unlimited), 20 (unused langchain/langgraph pins), 12 (dead journey steps), 10 (avatar route).
- Manual: revoke the old and the chat-pasted LLM keys; set SECRET_KEY + APP_ENV=production for shared runs.
