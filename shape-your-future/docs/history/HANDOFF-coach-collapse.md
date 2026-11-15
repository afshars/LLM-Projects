# HANDOFF coach-collapse: hide/show the Coach tactic card

## Done
- The "One tactic for today" card has a header row with a Show/Hide button (aria-expanded, aria-controls) so it
  does not take room from the chat. Collapsed = title row only (+ the saved tactic's name).
- The choice is remembered in this browser (localStorage key coach:tactic-collapsed, wrapped in try/catch; default open).
- After "Use this tactic" succeeds the card collapses by itself and still names the saved tactic.
- Hiding never loses a suggestion that is waiting for the user's yes (state is in the store, body is only hidden).
- i18n en+fa: tactic.show / tactic.hide. CSS: logical properties, tokens only.

## Files
frontend/src/views/coach-tactic.ts, src/state/coach-tactic.ts, src/styles/coach.css,
src/growth-os/i18n/en.ts, fa.ts, smoke/coach-tactic.test.ts (+3 tests).

## Checks
tsc RUN ok; check:i18n RUN ok; vitest RUN 25 files / 261 pass. build, pytest, Docker: NOT RUN (frontend-only change).
To see it in Docker: replace the files and run `docker compose up --build`.
