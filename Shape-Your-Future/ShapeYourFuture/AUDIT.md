# AUDIT (updated in Step 5)

Evidence: **RUN** = reproduced or verified by executing something in Step 4; **STATIC** = read from the code only. Severity: High = act before sharing or deploying, Medium = wrong behaviour or a broken rule, Low = clutter or latent risk.

## 1. The 14 original steps: status and evidence

| Step | What it was | Status now | Evidence |
|---|---|---|---|
| 1 | SIMPLIFICATION-MAP (what to keep / remove) | Done | The map file is not in this repo (it was an input document); its result is visible in the code: 4 pages, 4 route modules, 2 tables (`backend/app/db/models.py`, `frontend/src/growth-os/registry.ts`). STATIC |
| 2 | Crash / half-done audit | Done; superseded | Kept as `docs/history/AUDIT-crash-and-halfdone-step6.md`; its items were fixed in step 6 or deleted with their code. STATIC |
| 3 | Navigation cleanup | Done | `registry.ts` has exactly 4 items; no "More", no "coming soon" route (`smoke/nav.test.ts`, `shell.test.ts`). RUN: vitest passes |
| 4 | Delete Plan area (frontend) | Done | `docs/history/HANDOFF-step4.md` + `step4-deleted-files.txt`; no plan views/states remain. STATIC (grep for `plan-` views: none) |
| 5 | Delete remaining frontend areas | Done | `HANDOFF-step5.md`; `NAV` ids are only today/reflect/chat/profile. RUN: tsc, build, check:i18n pass |
| 6 | Crash fixes + global error state + retry | Done | `backend/tests/test_crash_regressions.py` (32 tests) and `frontend/smoke/app-error*.test.ts`, `app-shell-errors.test.ts`. RUN: all pass |
| 7 | Remove unused backend routes | Done | `main.py` registers `auth`, `profile`, `daily_entry`, `coach`. RUN: `app.openapi()` lists 13 endpoints. One route has no caller (row 10) |
| 8 | Remove unused backend services/graphs/models | Done (finished in Step 3 of the second series) | 1 service (`coach_tactics`), 2 tables. RUN: pytest imports and boots the app |
| 9 | Backend `daily_entry` | Done | `routes/daily_entry.py`, `tests/test_daily_entry.py` (43). RUN: pass |
| 10 | Frontend Today | Done | `views/today.ts`, `smoke/today-view.test.ts`, `today-state.test.ts`, `focus-timer.test.ts`. RUN: pass. Real browser NOT RUN |
| 11 | Frontend Reflect | Done | `views/reflect.ts`, `smoke/reflect-*.test.ts`. RUN: pass. Real browser NOT RUN |
| 12 | Coach (one tactic, confirm) + Profile + final nav | Done; Coach rule tightened in Step 2 and the day bug fixed in Step 4 | `tests/test_coach_approval_rule.py`, `test_day_helper.py`, `smoke/coach-*.test.ts`, `profile.test.ts`. RUN: pass. A real LLM answer NOT RUN |
| 13 | Repo hygiene, README, release zip | Done; README and docs corrected in Step 4 | README sections 1-5 match the files (STATIC); zip checked with `unzip -t` (RUN, see section 4) |
| 14 | Final checks, smoke test, AUDIT | Done; repeated in Step 4 | Section 2 below. The manual smoke test is still NOT RUN by anyone |

Second series (not part of the 14): security step 1 (secrets), step 2 (Coach = tactic card, approval rule), step 3 (dead backend code, `legacy_tables.py`) and this step 4 (user-day helper, rate limit, docs). Their rows are in sections 3 and 5.

## 2. Checks: RUN / NOT RUN (Step 4, clean extraction of the Step 3 zip)

Environment: Python 3.13 and Node 22 (the project targets 3.12 and 20). Backend packages were installed one by one: `fastapi 0.115.0`, `pydantic 2.9.2`, `pydantic-settings 2.5.2`, `sqlmodel 0.0.22`, `python-multipart`, `slowapi 0.1.9`, `python-dotenv`, `pytest 8.3.3`, `httpx 0.27.2`, `tzdata` and `langchain-groq 0.2.0` (needed by two tests). `npm ci` was run from `package-lock.json`.

| Check | Status | Result |
|---|---|---|
| Baseline pytest before any change | RUN | 199 passed, 6 failed (4 rate-limit tests; 2 `test_crash_regressions` tests that only needed `langchain_groq`) |
| `python -m pytest -q` after the changes | RUN | **216 passed, 0 failed** |
| `tests/test_general_api_rate_limiting.py` repeated 3 times | RUN | 12 passed each time |
| Mutation check: day helper ignoring the time zone | RUN | `test_day_helper.py`: 8 of 10 failed, so the boundary tests do detect the old bug |
| `python -m compileall app scripts tests` | RUN | ok |
| `npx tsc --noEmit` | RUN | exit 0, no output |
| `npm run build` | RUN | ok (`index-*.js` 78 kB) |
| `npm run check:i18n` | RUN | OK |
| `npx vitest run` | RUN | 19 files, 178 tests, all passed |
| `pip install -r backend/requirements.txt` as a whole | NOT RUN to completion | the resolver for `langchain==0.3.4` / `langgraph==0.2.28` did not finish within the time limit; so `langchain`, `langgraph`, `langchain-openai`, `-anthropic`, `-ollama` and `uvicorn` were NOT installed and no test imports them (see row 20) |
| `docker compose up --build` / `docker build` | NOT RUN | no Docker here |
| Manual smoke test (`docs/growth-os/09-smoke-test.md`) in a browser | NOT RUN | |
| Real LLM call | NOT RUN | no key; tests stub the model |
| Timezone behaviour in a real browser near local midnight | NOT RUN | backend part RUN with a pinned clock |
| Accessibility, screen reader, real RTL review | NOT RUN | |
| Dedicated secret scanner, git history check | NOT RUN | |

Commands to run yourself (from the project root):

```bash
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python -m pytest -q
cd ../frontend && npm ci && npx tsc --noEmit && npm run build && npm run check:i18n && npx vitest run
cd .. && docker compose up --build        # then tick docs/growth-os/09-smoke-test.md
```

## 2a. Step 5 (final verification): what was and was NOT run

**Environment of Step 5:** no network (`pip` and `npm` cannot reach any index), no Docker, no browser, no LLM key. Python 3.12.3, Node 22. Result: **nothing from tasks 1 to 5 could be executed.** No pass/fail counts are reported because none were produced.

| Task | Status | What happened |
|---|---|---|
| 1. Backend pytest, frontend vitest (real counts) | **NOT RUN** | `pip download` failed (name resolution); `npm ci` crashed ("Exit handler never called"), leaving no usable `node_modules`; no `fastapi`, `sqlmodel`, `slowapi`, `pytest` installed. |
| 2. Type checker and linter | **NOT RUN** | `tsc` not installed (see above). Only `python -m compileall backend/app backend/scripts backend/tests` was run: **RUN, ok** (syntax only; it is not a type check or lint). The project has no linter config (problem 22). |
| 3. Docker build/start, `/healthz`, fresh DB, upgrade DB | **NOT RUN** | No Docker. STATIC reading: `init_db()` = `create_all()` + `ALTER TABLE ... ADD COLUMN` for 4 `user` and 3 `dailyentry` columns (`backend/app/db/database.py`); `test_daily_entry_migration.py` covers it in pytest (NOT RUN here). |
| 4. Walk `09-smoke-test.md` | **NOT RUN** | No browser. Every step is FAIL-unknown, not PASS. |
| 5. Timezone boundary, 429 `Retry-After`, no AI save before approval | **NOT RUN** | The tests exist (`test_day_helper.py`, `test_general_api_rate_limiting.py`, `test_coach_approval_rule.py`) and were not executed. |
| New files for you to run | Added | `scripts/verify-all.sh` (syntax-checked with `bash -n`, never executed), `scripts/seed-old-db.py` (parsed only, never executed), `docs/growth-os/11-verification-runbook.md` (exact Docker, migration, smoke and retest commands). |

**About the numbers you quoted (1240 passed / 4 failed / 258 vitest):** they are not in this AUDIT.md. The last recorded numbers here are Step 4's: backend **216 passed, 0 failed**, vitest **178 tests in 19 files** (section 2, from Step 4, not reverified in Step 5). Treat the 1240 / 4 / 258 figures as unverified and from another source.

**Smoke-test record (fill in after you run it; nothing is claimed):**

| Step | Result |
|---|---|
| Register / login | NOT RUN |
| Today: highlight, time, laser, energize, timer, save | NOT RUN |
| Reload keeps data | NOT RUN |
| Reflect | NOT RUN |
| Coach tactic, approve, shows in Today and Reflect | NOT RUN |
| Language and theme in Profile | NOT RUN |
| Log out | NOT RUN |
| Timezone boundary (browser) | NOT RUN |
| 429 + Retry-After (curl) | NOT RUN |
| No AI save before approval (DB check) | NOT RUN |
| Docker: fresh DB / upgraded DB / `/healthz` | NOT RUN |

Run order: `bash scripts/verify-all.sh`, then sections B to E of `docs/growth-os/11-verification-runbook.md`.

## 3. Open problems

| # | Problem | Severity | File | Suggested fix | Evidence |
|---|---|---|---|---|---|
| 1 | **Revoke the old LLM key by hand.** The fragment in `HANDOFF-part24.md` is redacted (a test fails if a key-shaped string reappears), but the full key was in earlier copies of `docker-compose.yml` (git history, old zips, attachments) and a real key was pasted in a chat. Treat both as leaked. | High | provider dashboard; old zips | Revoke at the provider, issue a new key, keep old zips private. | STATIC; revocation cannot be checked here |
| 10 | `PUT /profile/me/avatar` has no caller in the UI (and no client method). | Low | `backend/app/api/routes/profile.py` | Remove the route and `avatar_*` columns usage, or add UI. | RUN: endpoint list vs client methods |
| 12 | Dead journey steps and wizard text remain: `DASHBOARD`, `CONTEXT_SETUP`, `GOAL_CREATION`, `DECOMPOSITION`, `GOAL_WORKSPACE`, `PLANNING_REQUIRED` in `journey.ts`; wizard strings in `lib/dictionary.ts`, `lib/step-indicator.ts`. No blank page results (deep links to retired routes open Today), but dead text ships and is translated. | Low | `frontend/src/state/journey.ts`, `lib/dictionary.ts`, `lib/step-indicator.ts` | Remove steps and dictionary groups nothing reads; `check:i18n` and tsc show what breaks. | STATIC |
| 14 | Header and Profile both have language, theme and log out. | Low | `frontend/src/lib/header.ts`, `views/profile-account.ts` | Keep language and theme in the header for signed-out users, drop the rest, or accept the duplication. | STATIC |
| 17 | Running the backend or its tests from `backend/` creates `backend/app.db`; a hand-made zip would ship it. | Low | `backend/app/core/config.py`, `.gitignore` | Keep the zip exclusions (`-x "*.db"`). | RUN: the file appears after pytest; excluded from the zip |
| 19 | New: `GET|PUT /profile/me` and `PUT /profile/me/avatar` have no rate limit (only the password change does). The rate-limit test file's docstring still says the general limit covers `profile.py`. | Low | `backend/app/api/routes/profile.py` | Add `@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")` and `request: Request`; fix the docstring. | RUN: `grep limiter.limit` shows one decorator in `profile.py` |
| 20 | New: `requirements.txt` pins `langchain==0.3.4` and `langgraph==0.2.28`, but no code imports `langchain`, `langgraph` or `langchain_core` directly; only `langchain_openai/anthropic/groq/ollama` are imported (lazily in `app/llm/provider.py`). The full resolve is slow and did not finish in Step 4. | Low | `backend/requirements.txt` | Drop `langchain` and `langgraph`, keep the four provider packages, re-run the full suite. | RUN: grep for imports; resolver run NOT completed |
| 21 | New: the rate-limit tests clear slowapi's private `limiter._route_limits` / `_dynamic_route_limits`; a slowapi upgrade could rename them (the test would then fail loudly with AttributeError, not silently). | Low | `backend/tests/test_general_api_rate_limiting.py` | Re-check on upgrade; `slowapi` is pinned to 0.1.9. | RUN |
| 22 | New (Step 5): no linter is configured for the backend (no ruff/flake8/mypy config) or the frontend (no eslint); only `tsc` and compileall exist. `verify-all.sh` runs `ruff` with defaults, which is a suggestion, not a project standard. | Low | `backend/`, `frontend/package.json` | Add a `ruff.toml` and an `npm run lint` if you want a gate. | STATIC |

## 4. Fixed (kept for the record)

| # | Problem | Fixed in | Evidence |
|---|---|---|---|
| 2 | Coach used the server's UTC day, so a tactic confirmed in Tehran between 00:00 and 03:30 landed on yesterday's row. Step 2 added `?day=`; **Step 4** removed the remaining UTC fallback: ONE helper `app/api/day.py` (`?day=` or the `X-Timezone` header, else UTC) is used by `/daily-entry/*` and `/coach/tactic/confirm|today`; no other module picks a day from the clock. | Steps 2 and 4 | RUN: `test_day_helper.py` (Tehran 00:30 -> local date; Los Angeles 23:30 -> local date; 2 days off -> 422; guard test greps for clock use) and `smoke/api-client-timezone.test.ts` |
| 3 | 429 had no `Retry-After`. | Step 4 | RUN: `rate_limit_exceeded_handler` in `app/core/rate_limit.py` returns whole seconds (>= 1, <= window) on every 429; tested on a per-minute and a per-second route |
| 4 | Three rate-limit tests failed in file order. Root cause below. | Step 4 | RUN: 12 passed, three times in a row; assertions unchanged |
| 5, 6, 8, 13 | Planning chat and `DailyPlanRecord`, chat transcripts, dead chat code, tactic not shown on Today/Reflect. | Step 2 | RUN: `test_coach_approval_rule.py` |
| 7 | Hard-coded `SECRET_KEY`. | Security step 1 | RUN: `test_production_config_enforcement.py`, `test_secret_hygiene.py` |
| 9, 11 | Dead frontend stores/views, dead backend services, routes and tables. | Step 3 | RUN: pytest boots the app, tsc clean. Old DB tables remain until you run `scripts/legacy_tables.py` |
| 18 | "Coming soon" placeholder copy. | Step 3 | RUN: `grep -rn "Coming soon\|being built" frontend/src` finds nothing |
| 15 | Unused `docker-entrypoint.sh`. | Security step 1 | STATIC |
| 16 | Old docs described removed features. | Step 4 | `docs/growth-os/00, 07, 08, 10` rewritten; old versions and `backend/docs/*` moved to `docs/history/obsolete/` with an OBSOLETE header; README and `09-smoke-test.md` corrected. STATIC |

**Root cause of the rate-limit test failures (one paragraph).** slowapi files every decorated function's limits under the key `"<module>.<function name>"` and *extends* that list each time `limiter.limit(...)` is applied. The test file builds its temporary routes inside fixtures, and every fixture's handler is called `_handler`, so every test that used a fixture added another limit to the same key: the second test saw `3/minute` twice, a later one `3/minute` plus `2/second`, and so on, making requests 429 earlier than the test expected. `limiter.reset()` only clears hit counters, not these registrations, so the old reset did not help, and tests passed alone but failed in file order. The fix is an autouse fixture that removes this module's keys from the limiter's registries and resets the counters before and after each test. The separate missing `Retry-After` was because the limiter is built without `headers_enabled` (slowapi's header injection needs a `response` argument on every route), so nothing set the header; the app now has its own 429 handler that computes it from the limiter's window stats.

## 5. Secrets and files in the release zip

- RUN (Step 4 zip, see the changelog for the count): no `.env`, `*.db`, `node_modules`, `dist`, `.git`, `__pycache__`, `.pytest_cache`, `*.tsbuildinfo`.
- `.env.example` has placeholders only. `test_secret_hygiene.py` (RUN, passes) fails if a key-shaped string appears in the tree.
- NOT RUN: a dedicated secret-scanning tool; git history (no `.git` in the zip).

## 6. Crash bugs

No crash bug is known to be open. Covered by `test_crash_regressions.py` and the frontend error tests (RUN, passing). Not known: behaviour in a real browser, with a real LLM, under Docker, and near local midnight in a browser.
