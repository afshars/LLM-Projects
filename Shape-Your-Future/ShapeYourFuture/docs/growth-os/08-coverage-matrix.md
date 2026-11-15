# 08 - Coverage matrix: endpoint -> client method -> page

Endpoints come from `app.openapi()` (`backend/app/main.py`); client methods from `frontend/src/api/client.ts`; the page is
the view whose code (directly or through its store) makes the call. Read from the source; the executable form of the
client side is `frontend/smoke/api-client-usage.test.ts`. Checked in Step 4 against the code of Step 3 + 4. Not driven in a browser.

| # | Endpoint | Client method | Page (view -> store) | Backend tests |
|---|---|---|---|---|
| 1 | `POST /auth/register` | `register` | Sign-in screen (`views/auth.ts`) | `test_api.py` |
| 2 | `POST /auth/login` | `login` | Sign-in screen (`views/auth.ts`) | `test_api.py` |
| 3 | `GET /profile/me` | `getProfile` | Profile (`views/profile-account.ts` -> `state/profile.ts`) | `test_profile.py` |
| 4 | `PUT /profile/me` | `updateProfile` | Profile (display name) | `test_profile.py` |
| 5 | `PUT /profile/me/password` | `changePassword` | Profile (change password) | `test_profile.py` |
| 6 | `PUT /profile/me/avatar` | none | **no page** (see AUDIT row 10) | `test_profile.py` |
| 7 | `GET /daily-entry/today` | `getDailyEntryToday` | Today and Reflect (`state/today.ts`) | `test_daily_entry.py` |
| 8 | `PUT /daily-entry/today` | `saveDailyEntryToday` | Today (Highlight, Laser, Energize, time) and Reflect (done, energy, change, "used the tactic?") | `test_daily_entry.py` |
| 9 | `GET /daily-entry/recent` | `getDailyEntryRecent` | Reflect "Last 7 days" (`state/reflect.ts`) | `test_daily_entry.py` |
| 10 | `POST /coach/tactic/suggest` | `suggestTactic` | Coach (`views/coach-tactic.ts` -> `state/coach-tactic.ts`); the only LLM route | `test_coach_tactic.py`, `test_coach_approval_rule.py` |
| 11 | `POST /coach/tactic/confirm` | `confirmTactic` | Coach "Use this tactic" | `test_coach_approval_rule.py`, `test_day_helper.py` |
| 12 | `GET /coach/tactic/today` | `getConfirmedTactic` | Coach (saved tactic) | `test_coach_approval_rule.py`, `test_day_helper.py` |
| 13 | `GET /healthz` | none | Docker health check only (`backend/Dockerfile`) | `test_api.py` |

Summary: 13 endpoints; 11 with a page; 2 without (row 6 is dead and listed in AUDIT.md; row 13 is infrastructure on purpose).
Pages and their calls: Today = 7, 8; Reflect = 7, 8, 9; Coach = 10, 11, 12; Profile = 3, 4, 5; Sign-in = 1, 2. The
Today page also shows the confirmed tactic read-only, from the `tactic` field of row 7.

How to re-check (from `backend/`): `python -c "from app.main import app; print(sorted((m.upper(), p) for p, ms in app.openapi()['paths'].items() for m in ms))"`
and compare with `grep -n 'request<' ../frontend/src/api/client.ts`.
