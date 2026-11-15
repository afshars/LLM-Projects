# HANDOFF step9 (backend: daily_entry, the core loop)
## What changed
- Model `DailyEntry` (table dailyentry) in db/models.py: one row per (user_id, entry_date), unique constraint. Columns: highlight, highlight_done, scheduled_time (HH:MM), laser_{notifications_off,remove_apps,internet_distance}, energize_{walk,real_food,caffeine,rest}, energy 1-10, reflection_note, change_for_tomorrow, created_at/updated_at. Plain booleans, no score/streak column. create_all makes the table; no migration, old tables untouched.
- Schemas (schemas/daily_entry.py): DailyEntryOut, DailyEntryUpdate (extra keys -> 422, StrictInt energy 1-10, StrictBool checks, text trimmed, blank = None, limits 200/1000/500), RecentOut (7 days, only date/highlight/highlight_done).
- Routes (api/routes/daily_entry.py, wired in main.py, auth + 60/min limiter): GET /daily-entry/today (empty default, exists=false, never creates), PUT /daily-entry/today (upsert, only sent keys change, explicit null clears text/time/energy, null on a yes/no = unchanged), GET /daily-entry/recent (last 7 days, oldest first, highlight_done=null when the day had no highlight).
- Rules: highlight_done/scheduled_time need a highlight (422); clearing the highlight resets both; optional ?day=YYYY-MM-DD (client's local day) must be within 1 day of server UTC date, else 422 (past cannot be rewritten); first-save race handled by the unique constraint + one retry.
- Tests: tests/test_daily_entry.py (~50 cases incl. parametrized): auth, empty default, create/merge/clear, validation, day param, user isolation, DB unique constraint, recent (no stats/streaks).
## Checks
- RUN: py_compile of 5 files; import graph (0 unresolved `from app.x import y`, daily_entry reachable from main); unused-import check on the new files.
- NOT RUN: pytest -q, app boot, pydantic/SQLModel behaviour (no fastapi/pytest/pydantic here, no network). Run `cd backend && pytest -q tests/test_daily_entry.py` first, then the full suite.
## Not verified / assumptions
- Optional[StrictInt] with Field(ge=1, le=10) and extra="forbid" are expected to give 422 for 0, 11, "5", true, 5.5 and unknown keys: unrun.
- Assumption: "today" = client's day via ?day, default server UTC date. Laser/Energize keys are the book's fixed 3 and 4 checks.
## Git commit message
feat(backend): add daily_entry model and /daily-entry routes for the Highlight/Laser/Energize/Reflect loop
