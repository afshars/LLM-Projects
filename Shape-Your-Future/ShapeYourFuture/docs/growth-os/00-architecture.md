# 00 - Architecture (the app as it is now)

Shape Your Future (آینده‌ات را بساز) is one small daily loop per user, from the book *Make Time*: **Highlight** (one priority) -> **Laser**
(three distraction cuts) -> **Energize** (four checks) -> **Reflect** (evening). Four pages: **Today**, **Reflect**,
**Coach**, **Profile**. English and Persian (RTL/LTR), light and dark.

The AI has one small job: ask about today's obstacle and suggest **one** tactic from a fixed catalogue. It is saved only
after the user presses "Use this tactic". Old designs (goal trees, planning chat, dashboards, focus sessions, behaviour
memory) are gone; their notes are in `docs/history/obsolete/`.

## Stack

| Layer | What | Where |
|---|---|---|
| Frontend | Vanilla TypeScript + Vite, DOM helpers, no framework; vitest + jsdom smoke tests | `frontend/` |
| Backend | FastAPI + SQLModel, SQLite, slowapi rate limiting | `backend/app/` |
| LLM | One provider-neutral factory (`openai`, `anthropic`, `groq`, `ollama`, `openai_compatible`); used by ONE route | `backend/app/llm/provider.py` |
| Deploy | `docker-compose.yml` (frontend on nginx, backend on uvicorn, SQLite in a named volume) | repo root |

## Backend

```
app/main.py                   app, CORS, request-id + security-header middleware, 429 and error handlers
app/api/routes/auth.py        POST /auth/register, /auth/login
app/api/routes/profile.py     GET|PUT /profile/me, PUT /profile/me/password, PUT /profile/me/avatar
app/api/routes/daily_entry.py GET|PUT /daily-entry/today, GET /daily-entry/recent
app/api/routes/coach.py       POST /coach/tactic/suggest, POST /coach/tactic/confirm, GET /coach/tactic/today
app/api/day.py                THE one helper that turns "now" into the user's calendar day (see below)
app/services/coach_tactics.py classify the obstacle -> map to a tactic family -> pick -> validate (one of the two LLM uses; the other is the AI chat, services/chat_service.py)
app/llm/tactics.py            the tactic catalogue; blocker_map.py maps obstacle type -> family
app/core/                     config (env only), security, rate_limit (limiter + 429 handler), logging, request id
app/services/chat_service.py  the AI chat (Coach page, right part): a plain conversation, reads today's Highlight, writes only its own messages
app/db/models.py              four tables: user, dailyentry, chatconversation, chatmessage
scripts/legacy_tables.py      report / drop (with JSON backup) / restore for tables of the old multi-feature versions
```

### The user's calendar day (one helper)

A per-day row (`dailyentry`, unique on user + date) is addressed by the **user's** calendar day, never the server's.
`app/api/day.py` is the only module that reads the server clock for a day. Routes use `Depends(request_day)`:

1. `?day=YYYY-MM-DD` (the browser's local date, `localDay()` in `frontend/src/state/today.ts`) is used when present;
2. otherwise the `X-Timezone` header (an IANA name such as `Asia/Tehran`, sent on every request by `frontend/src/api/client.ts`) is
   used to compute the local date;
3. with neither, the server's UTC date is the fallback.

A `day` more than one day away from the user's local date (UTC when no zone is sent) is a 422, so past days cannot be
rewritten later. Today, Reflect and Coach all go through this one path. `tests/test_day_helper.py` pins the clock and
covers Asia/Tehran at 00:30 local (UTC date is the day before) and America/Los_Angeles at 23:30 local (UTC date is the
day after), and fails if any other module reads the clock to pick a day.

### The approval rule

Only `POST /coach/tactic/confirm` writes a tactic, and it re-validates the id against the catalogue. `POST
/coach/tactic/suggest` is the only route that calls an LLM and it persists nothing (`tests/test_coach_approval_rule.py`).
No AI text is stored anywhere.

### Data

- `user`: username, password hash, optional display name.
- `dailyentry`: highlight, highlight_done, scheduled_time, 3 Laser checks, 4 Energize checks, energy (1-10),
  reflection_note, change_for_tomorrow, coach_tactic_id, coach_blocker_type, coach_tactic_applied. Plain columns, no JSON.

### Errors and limits

- 429 carries `Retry-After` in whole seconds (`app/core/rate_limit.py`). Register is 5/minute, login 10/minute, password change
  5/minute, the LLM route `RATE_LIMIT_PER_MINUTE` (default 20); the daily-entry and coach confirm/today routes share
  `GENERAL_RATE_LIMIT_PER_MINUTE` (default 60). `GET|PUT /profile/me` and `PUT /profile/me/avatar` have no limit (AUDIT row 19).
- A missing LLM key answers `503 llm_not_configured`; everything else keeps working.
- `SECRET_KEY` comes from the environment only; with `APP_ENV=production` the backend refuses to start with a missing,
  dev or short key.

## Frontend

```
src/main.ts, app.ts           boot, step -> view mapping, global error state
src/views/                    today, reflect, coach (+ coach-tactic card), profile-account, auth, section-view
src/state/                    today (auto-saving store, localDay), reflect (last 7 days), coach-tactic, profile,
                              focus-timer, journey (which screen shows)
src/api/                      client.ts (the only fetch; ApiError kinds; X-Timezone), types.ts, auth-storage.ts
src/growth-os/                registry.ts = the four navigation items; nav.ts lookups; i18n/en.ts + fa.ts (fa typed as en)
src/lib/                      dictionary + theme/locale, header, nav shell, ui helpers (confirm dialog, drafts, async panel)
src/styles/tokens.css         colours, spacing, type scale; CSS uses logical properties only
```

Rules kept by tests and scripts: every visible string is an i18n key present in `en` and `fa`
(`npm run check:i18n`); no hard-coded colours; saving is automatic and optimistic with a visible "not saved yet" +
"Try again" state; a failed request shows a translated error with a retry, never a blank page.

## Known leftovers (see AUDIT.md)

Dead journey step names and wizard text in `state/journey.ts`, `lib/dictionary.ts`, `lib/step-indicator.ts` (row 12); the
avatar route has no caller (row 10); the header and Profile both carry language/theme/logout (row 14).
