# Changelog: Step 4 (timezone, rate limit, docs)

## Backend
- `app/api/day.py`: now THE helper for the user's calendar day: `utc_now()`, `local_date(moment, tz)`, `resolve_day(day, tz)`, and the dependency `request_day` (`?day=` or `X-Timezone`, else UTC; a `day` more than one day off is 422).
- `routes/daily_entry.py`, `routes/coach.py`: all day routes use `Depends(request_day)` (Coach confirm/today no longer depend on the UTC date).
- `app/core/rate_limit.py`: own 429 handler with `Retry-After` in whole seconds; `app/main.py` registers it and allows the `X-Timezone` header in CORS.
- `requirements.txt`: `tzdata` (zone data for zoneinfo on slim images / Windows).
- Server-clock grep (`date.today`, `utcnow`, `datetime.now`, `current_date`, `time.time`): only `api/day.py` (day logic), `db/models.py` `now()` (updated_at timestamp), `core/security.py` (token expiry) and `scripts/legacy_tables.py` (backup name) remain; none picks a user-facing day. A test enforces this.
## Frontend
- `src/api/client.ts`: sends `X-Timezone` (browser IANA zone) on every request.
## Tests
- New `backend/tests/test_day_helper.py` (10), new `frontend/smoke/api-client-timezone.test.ts` (2), new Retry-After test (1); autouse limiter fixture in `test_general_api_rate_limiting.py` (assertions unchanged).
## Docs
- Rewritten: `docs/growth-os/00, 07, 08, 10`; fixed README and `09-smoke-test.md`; `AUDIT.md` restructured (14 steps, RUN/NOT RUN, root cause).
- Moved to `docs/history/obsolete/`: the old four docs and all of `backend/docs/*` (OBSOLETE header added).
