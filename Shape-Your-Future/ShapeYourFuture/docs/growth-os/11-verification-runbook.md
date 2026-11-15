# 11 - Verification runbook (Step 5): what you run, exact commands

Nothing below has been run by the author of this file (no network, no Docker, no browser in that environment). Record every result in `AUDIT.md` section 2. Write FAIL as FAIL.

## A. Automated checks (about 10 min, no Docker)

```bash
bash scripts/verify-all.sh      # writes verify-report.txt with the real summary lines
```

Paste the pytest summary line (`N passed, N failed, N skipped`) and the vitest lines (`Test Files`, `Tests`) into AUDIT.md. `ruff` is only a suggested linter: the project has no lint config (see AUDIT.md problem 22).

## B. Docker

```bash
cp .env.example .env            # add LLM_API_KEY etc. (never commit .env)
docker compose up --build -d
docker compose ps               # both services Up; backend "healthy"
curl -s http://localhost:8010/healthz     # expect {"status":"ok","env":...,"llm_configured":true}
docker compose logs backend | head -40    # no traceback; no "migration" error
```

**B1. Fresh database.** `docker compose down -v` (deletes the volume), then `up --build -d`. Register a user in the UI. PASS = no errors in `docker compose logs backend`.

**B2. Existing database from the previous version.** Preferred: put a real `app.db` from the previous release into the volume. Fallback (simulated old schema):

```bash
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python ../scripts/seed-old-db.py /tmp/old.db && cd ..
docker compose down && docker compose up --no-start --build
docker cp /tmp/old.db "$(docker compose ps -aq backend)":/data/app.db
docker compose up -d
docker compose exec backend python -c "import sqlite3;c=sqlite3.connect('/data/app.db');print([r[1] for r in c.execute('pragma table_info(user)')]);print([r[1] for r in c.execute('pragma table_info(dailyentry)')])"
```

PASS = the lists now contain `display_name, bio, avatar_kind, avatar_value` and `coach_tactic_id, coach_blocker_type, coach_tactic_applied`; login as `olduser` / `Old-Pass1!` works and the 2026-11-01 highlight is still there. If the container runs as a non-root user and `docker cp` leaves the file unreadable, record that as a finding.

## C. Smoke test

Follow `docs/growth-os/09-smoke-test.md` (copy it to `09-smoke-test-run-DATE.md`). Record PASS/FAIL per step in the table at the end of AUDIT.md section 2b.

## D. Three specific retests

**D1. Timezone boundary.** Automated: `cd backend && python -m pytest -q tests/test_day_helper.py` (Tehran 00:30, Los Angeles 23:30). In a browser: set the OS time zone to Asia/Tehran (or use DevTools > Sensors > Location/time zone), tick a Today check between 00:00 and 03:30 Tehran time (or set the zone so local date differs from UTC), open Network: the `PUT /daily-entry/today` request must carry `X-Timezone` or `?day=` with the LOCAL date; then confirm a Coach tactic and check that `GET /coach/tactic/today` returns it for the local date, not yesterday.

**D2. 429 and Retry-After.** Register allows 5 per minute:

```bash
for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -D - -X POST http://localhost:8010/auth/register -H 'Content-Type: application/json' -d "{\"username\":\"rl$i\",\"password\":\"Abcdef1!x\"}" | grep -iE "^HTTP|retry-after"; done
```

PASS = the 6th/7th answer is `429` and has a `Retry-After` header of whole seconds, 1 to 60. Automated: `python -m pytest -q tests/test_general_api_rate_limiting.py`. In the UI the message must say how many seconds to wait.

**D3. Nothing from the AI is saved before approval.** Automated: `python -m pytest -q tests/test_coach_approval_rule.py`. Manual: log in, open Chat, ask for a tactic. Before pressing approve: `docker compose exec backend python -c "import sqlite3;print(sqlite3.connect('/data/app.db').execute('select id,coach_tactic_id,coach_blocker_type from dailyentry').fetchall())"` must show no tactic for today; reload Today and Reflect: no tactic card. Press approve: the row now has it and both screens show it. Reject/ignore a second proposal and re-check that nothing changed.

## E. Real LLM

With a real key in `.env`, `/healthz` shows `llm_configured: true`. Ask Chat for a tactic in English and in Persian; PASS = one tactic card, no raw JSON, no error banner. Also try a wrong key: the UI must show the "AI assistant is not available" message, not a blank page.
