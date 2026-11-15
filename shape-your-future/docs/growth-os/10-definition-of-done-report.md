# 10 - Definition of done: the Shape Your Future loop

Each line is a requirement of the product, the evidence that exists, and whether that evidence was **RUN** (executed in
Step 4, result given) or **NOT RUN**. A line is MET only when a check was run or the behaviour is a plain reading of the
code that a test also pins. Nothing here was driven in a real browser or with a real LLM.

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Four pages only: Today, Reflect, Coach, Profile; no tab, "More" menu or "coming soon" | `growth-os/registry.ts` lists four items; `smoke/nav.test.ts`, `smoke/shell.test.ts` | MET (vitest RUN) |
| 2 | Today: Highlight, Laser (3), Energize (4), optional time and focus timer, saved by itself, under a minute | `smoke/today-view.test.ts`, `today-state.test.ts`, `focus-timer.test.ts`; `backend/tests/test_daily_entry.py` | MET in tests (RUN); the "under a minute" feel is NOT RUN (needs a person) |
| 3 | Reflect: done yes/no, energy 1-10, what to change, last 7 days as Yes / No / No Highlight; no counts or streaks | `smoke/reflect-view.test.ts`, `reflect-state.test.ts`; `test_daily_entry.py` | MET in tests (RUN) |
| 4 | Coach suggests ONE tactic from the catalogue; saved only after "Use this tactic" | `backend/tests/test_coach_approval_rule.py`, `test_coach_tactic.py`; `smoke/coach-tactic.test.ts`, `coach-loop.test.ts` | MET in tests (RUN); a real LLM answer NOT RUN |
| 5 | No AI output saved without explicit approval | `suggest` writes nothing, `confirm` re-validates the id (`test_coach_approval_rule.py`) | MET (pytest RUN) |
| 6 | The confirmed tactic shows on Today (read only) and on Reflect ("did you use it?") | `test_coach_approval_rule.py`, `smoke/today-view.test.ts`, `reflect-view.test.ts` | MET in tests (RUN) |
| 7 | "Today" is the user's day for Today, Reflect AND Coach, including just after local midnight | `app/api/day.py` + `tests/test_day_helper.py` (Asia/Tehran 00:30, America/Los_Angeles 23:30, 2-days-off = 422); `smoke/api-client-timezone.test.ts` | MET in tests (RUN); not checked in a browser near midnight |
| 8 | Profile: language, theme, display name, password, log out only | `smoke/profile.test.ts`, `backend/tests/test_profile.py` | MET in tests (RUN) |
| 9 | English and Persian, RTL/LTR, light and dark; every string an i18n key; no hard-coded colours | `npm run check:i18n` (RUN, OK); tokens + logical CSS by convention | i18n parity MET (RUN); real RTL look and contrast NOT RUN |
| 10 | A failed request never gives a blank page: translated error + retry | `smoke/app-error*.test.ts`, `app-shell-errors.test.ts`, `api-client-nonjson.test.ts` | MET in tests (RUN) |
| 11 | 429 tells the client when to retry | `Retry-After` in whole seconds on every 429 (`tests/test_general_api_rate_limiting.py`) | MET (pytest RUN) |
| 12 | No secret in the repo; `SECRET_KEY` from the environment; production refuses weak keys | `test_secret_hygiene.py`, `test_production_config_enforcement.py` | MET in tests (RUN); revoking the old leaked key is a manual step NOT doable here |
| 13 | The app builds and starts | `npm run build` (RUN, ok); the pytest app fixtures import and start `app.main` | build MET; `docker compose up` NOT RUN (no Docker) |
| 14 | Old databases are not damaged | `scripts/legacy_tables.py` never runs by itself; `test_legacy_tables_script.py` | MET in tests (RUN) |

What is not covered by anything run: a real browser, a real LLM, Docker, screen readers, real RTL review, and the manual
list in `09-smoke-test.md`. Exact commands and results of every check are in `AUDIT.md` ("RUN / NOT RUN").
