# 07 - QA report (current state, Step 4)

What is tested, how, and what is not. Counts come from `pytest --collect-only` and `vitest` runs of Step 4 in a clean
copy of the project. Environment of that run: Python 3.13 and Node 22 (the project targets Python 3.12 and Node 20), with
the packages the tests import installed one by one (see AUDIT.md, "Checks"). Results of each run are in `AUDIT.md`.

## Automated tests

### Backend (`backend/tests/`, 216 tests, no real LLM, temporary SQLite)

| File | Tests | What it pins |
|---|---|---|
| `test_api.py` | 4 | register/login, wrong password, token required, `/healthz` |
| `test_security.py` | 8 | password rules, hashing, token encode/decode |
| `test_profile.py` | 13 | profile read/update, password change, avatar presets |
| `test_daily_entry.py` | 43 | the daily loop: partial updates, Highlight rules, Laser/Energize keys, `?day=` window, last 7 days, concurrent first save |
| `test_daily_entry_migration.py` | 3 | in-place column upgrade of an old `dailyentry` table |
| `test_day_helper.py` | 10 | the user's calendar day: Tehran 00:30 and Los Angeles 23:30 boundaries, unknown zone fallback, 2-days-off = 422, tactic lands on the local day, no other module reads the clock |
| `test_coach_tactic.py` | 14 | classify -> family -> pick -> validate; grounding gate |
| `test_coach_approval_rule.py` | 12 | nothing saved before confirm; confirm re-validates; tactic visible on Today/Reflect; `?day=` rules |
| `test_general_api_rate_limiting.py` | 12 | 429 at the limit, `Retry-After` in whole seconds, window expiry, concurrency, per-test limiter reset |
| `test_crash_regressions.py` | 32 | the Step 6 crash fixes (missing LLM key = 503, odd bodies, etc.) |
| `test_production_config_enforcement.py` | 17 | production refuses missing/dev/short `SECRET_KEY` |
| `test_secret_hygiene.py` | 12 | no key-shaped string in the repo |
| `test_json_logging.py`, `test_request_id_middleware.py` | 17 + 13 | log format, `X-Request-ID` (also on 429 and 500) |
| `test_legacy_tables_script.py` | 6 | report / drop / restore with JSON backup |

`tests/conftest.py` resets the limiter before and after every test using the `client` fixture; the rate-limit test file
also has its own autouse fixture (see AUDIT.md row 4 for why).

### Frontend (`frontend/smoke/`, 19 files, 178 tests, vitest + jsdom)

Today (view + store + focus timer), Reflect (view + store), Coach tactic card and loop, Profile, navigation shell, the
global error state, the API client (non-JSON answers, `X-Timezone`, endpoint usage), and the shared UI helpers.
Other scripted checks: `npx tsc --noEmit`, `npm run build`, `npm run check:i18n` (en/fa key and placeholder parity).

## Not covered by any automated test

- A real browser: layout, RTL mirroring, 375 px width, focus order, dark/light contrast, screen readers.
- A real LLM answer, a real provider key, and the 503 path with a real misconfigured provider.
- Docker (`docker compose up --build`), nginx proxying, the named volume.
- Behaviour near local midnight in a real browser (the backend part is covered by `test_day_helper.py` with a pinned clock).
- Load or concurrency beyond the two-requests-at-once cases in `test_daily_entry.py`.

These are what `09-smoke-test.md` is for: a person ticks it, in English and in Persian.

## Known weak spots (details in AUDIT.md)

`GET|PUT /profile/me` and the avatar route have no rate limit; unused `langchain` and `langgraph` pins in
`requirements.txt`; dead journey steps and wizard text in the frontend; no secret-scanning tool has been run.
