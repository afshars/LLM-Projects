# HANDOFF step11 (frontend: the new Reflect screen)
## What changed
- Reflect (route reflect/evening, RouteKey "reflect", views/reflect.ts) = 3 evening questions on today's DailyEntry, the same record Today fills: Highlight done? (one yes box, only when today has a Highlight), energy 1-10 (radios), what do I change tomorrow? (one sentence). Every change saves itself via todayStore (PUT /daily-entry/today); no Save button; a failed save keeps the answer, says "not saved" + Try again.
- Last 7 days (state/reflect.ts, GET /daily-entry/recent, once per day): date + Yes / No / No Highlight, newest first, today's row follows the tick on screen. No counts, rates, streaks, charts, colours-only meaning.
- Removed the old progress-check code it replaces: 3 views, 5 state files, blocker-icons, progress-check.css, 6 smoke tests, client runProgressCheck/confirmProgressCheck + types, growth i18n progressCheckPage + route "reflect/progress-check" (now a retired id). Also the unreachable views/focus-feedback.ts (it linked to the old route). List: step11-deleted-files.txt (17).
- i18n en+fa: `reflect` block, growth.routes.reflect, focus.backToToday (replaces a progressCheckPage key). CSS: styles/reflect.css (tokens + logical properties only).
- Tests: reflect-state (9), reflect-view (16); nav/shell/focus-flow-view updated (old route id retired, feedback block removed).
## Checks
- RUN: tsc --noEmit (TS 6.0.3): 0 errors besides 11 asset-import errors (vite types absent). i18n parity (compiled script): OK, en = fa = 394.
- RUN (custom node runner + fake DOM, NOT vitest/jsdom): reflect-state 9/9, reflect-view 16/16, nav 10/10, app-error 8/8; 2 mutation checks fail on broken code.
- NOT RUN: vitest + jsdom (not installed, no network), so shell.test, focus-flow-view.test and the rest of the suite; npm run build; browser; backend pytest (no backend change).
## Not verified / left
- Backend still has /chains/progress-check(+confirm) and progress_graph (no frontend caller now): remove in the backend cleanup.
- reflection_note exists in the API but Reflect does not ask for it (3 questions only). lib/ui/review-and-confirm stays (generic kit, still tested).
## Git commit message
feat(frontend): new Reflect screen with 3 evening questions and last 7 days, replacing progress-check
