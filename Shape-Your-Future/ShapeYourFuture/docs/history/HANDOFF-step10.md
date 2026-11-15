# HANDOFF step10 (frontend: the new Today screen)
## What changed
- Today (journey step DAILY_PLAN) is now views/today.ts: Highlight (one text field + optional time), Laser (3 checks + optional focus timer), Energize (4 checks). No Save button: every change saves itself (PUT /daily-entry/today, only the changed keys). No points, streaks or totals; no setup-wizard step indicator.
- state/today.ts: GET /daily-entry/today?day=<local day> once (again on a new day / Try again). Taps show at once; saves are serialized and merged; a failed save keeps the tick, shows "not saved" + Try again, and the retry never overwrites newer changes. 401 -> login.
- state/focus-timer.ts: client-only countdown (15/25/50 min) stored as an END time in localStorage (survives language switch + reload, no request, no background timer). Reuses the focus status chip, focus.css and focusRunningBanner (a running backend session still shows on Today).
- api/types.ts + client.ts: DailyEntry types, getDailyEntryToday, saveDailyEntryToday. dictionary.ts: `today` block (en+fa). styles/today.css: tokens + logical properties only.
- Removed (screen replaced): views/daily-plan.ts, views/next-action-now.ts and their 2 view tests. focus-flow-view tests now start a session through journey.startFocus.
## Unused now, delete in a later step (not touched here)
- state/daily-plan.ts, state/next-action-now.ts (+2 state tests), client getDailyPlan/getNextActionNow/startFocus + focusFlowStore.start, i18n `plan.*`, step-indicator in lib/page.ts, plan CSS in style.css.
## Checks
- RUN: tsc --noEmit OK; npm run build OK; check:i18n OK (en 439 = fa 439); vitest 350 passed / 4 skipped (pre-existing skips), 28 files. Screenshots (Chromium, API mocked): en light 390px, fa dark 390px, fa light 1100px.
- NOT RUN: backend pytest (no backend change); real backend end-to-end (stubbed fetch only).
## Assumptions
- A focus session in the backend needs a NextAction id, so the Highlight timer is client-only; starting backend sessions from the UI is gone with the old plan list.
## Git commit message
feat(frontend): new Today screen with Highlight, Laser (+ focus timer) and Energize, auto-saving to /daily-entry
