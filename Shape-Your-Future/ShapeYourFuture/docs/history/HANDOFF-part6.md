# Part 6 — Goals A (HANDOFF)

List, detail + edit, archive/delete, progress on every card, and the decompose-on-language-switch fix.

**Verified:** `tsc --noEmit` clean (only the 3 known environment errors: fonts + css side-effect imports, no `node_modules` here). 29 behaviour checks in real Chromium at a 375 px viewport against a mocked API, all passing. I also ran the decompose check against your *original* `decomposition.ts` to be sure the test can fail: it sent 4 POSTs; the fix sends 1. I also opened every nav route at 375 px in FA and EN: no horizontal scroll, focus lands on `<main>`.
**Not verified:** the repo's own vitest suite (`npm i -D vitest@2 jsdom@25`, not installable here), a real backend, how it *looks* (I only asserted layout facts, not aesthetics), screen readers. Persian copy under `growth.goals` is mine: please have a native speaker skim it.

## State the zip was in
Parts 3, 4 and 5 were already in the tree. Part 6 was half-applied and **broke the build**: `state/goals.ts` was a stub importing a non-existent `../lib/api-client`, `section-view.ts` imported a missing `./goals`, `styles/goals.css` was never imported, and the registry had no `goals/list` route. All fixed. (The HANDOFFs for Parts 4 and 5 were not in the zip; only Part 3's was.)

## Files
New: `views/goals.ts`, `lib/goal-tree.ts`. Rewritten: `state/goals.ts`, `styles/goals.css`, `views/decomposition.ts`.
Small edits: `state/journey.ts` (+`forgetGoal`), `state/goal-workspace.ts` (+`forget`), `growth-os/registry.ts` (Goals: entry is now route `goals/list`), `growth-os/types.ts` (+`goalsList` RouteKey), `growth-os/i18n/en.ts` + `fa.ts` (`routes.goalsList`, new `goals` block), `main.ts` (imports `goals.css`).

## Behaviour
- **List:** `GET /goals` (toggle "show archived"), `asyncPanel` skeleton/empty/error+retry. Each card loads `GET /goals/{id}/progress` and shows a `scoreBar` (number written out) + "x of y next actions". A failed progress call shows a local retry, not a page error.
- **Detail + edit:** `GET /goals/{id}`, form via `formField` (title, horizon, deadline, priority 1–5, status) with drafts that survive a language switch and are cleared after a successful save. `PUT` sends **only changed fields**; no changes → message, no request. Save uses `submitLock` (double-submit blocked, 429 → "please wait").
- **Archive / delete:** two buttons, both through `confirmDialog`. Archive = `DELETE /goals/{id}` (backend default, reversible: restore by setting status back to Active). Delete permanently = `DELETE …?hard=true`. Both 204. Errors stay inside the dialog. After success the goal is removed from the list, progress/roadmap caches, `journey.goal` and the workspace tree, and focus goes to the list heading.
- **Decompose fix:** `goalsStore.decompose(id)` sends `POST /decompose` **at most once per goal**: deduplicated while in flight, result cached. Both the Decomposition step and the detail's "Break it down" button read that state, so a language switch redraws without any request. On the 400 "already decomposed" the store fetches `GET /goals/{id}/tree` and shows it (no error). Only an explicit "Retry" after a real failure sends it again. Errors are stored as `ApiError` and translated at render time.

## Decisions and caveats
- **A deadline can be changed but not cleared.** `apiClient.updateGoal` drops null/empty values (`compact`), and the backend treats absent and null differently. The form says so. Clearing it needs a client change first.
- **Goals nav now lands on the list**, not the workspace. The workspace is one click away from a goal's detail ("Open goal workspace"). The sub-nav shows a single "Goals" tab for now.
- Progress is one request per goal (N+1). Fine for tens of goals; a batch endpoint would be better later.
- Selecting a goal keeps you on the same route, so focus moves to the detail heading (and back to the card on "All goals") instead of `<main>`.
- `GoalStatus "archived"` is only offered in the status select for an already-archived goal (to restore it); archiving itself always goes through the dialog.
- Not migrated: the Dashboard and Workspace still use their own loading/error blocks.
