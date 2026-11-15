# HANDOFF part 12c: Plan interview, entry screen (route `plan/interview`, before the chat)

**Run this time:** I could install dependencies (npm registry reachable), so unlike 12a/12b this part WAS run: `tsc --noEmit -p .` clean, `vitest run` 46 files / 1130 tests pass, `check-i18n-parity` OK (828 / 828), `vite build` OK. **Not seen in a browser:** layout, RTL, focus ring.

## Files
- NEW `src/state/plan-entry.ts`: the working list + phase (`"entry" | "chat"`). Exports `planEntry` (get/set/subscribe), `PLAN_ENTRY_MAX` (20), `validateEntry(items)` (pure: per-row `"empty" | "duplicate" | null`, count, `canStart`), `entryCandidates(items)` (trimmed), `hasInterviewProgress(slice)`, `syncEntryWithHandoff()`, `editEntryItem`, `removeEntryItem`, `addEntryItem(text)` (`"added" | "empty" | "duplicate" | "full"`), `startFromEntry()`, `resetPlanEntry()`. Reset at the login step.
- NEW `src/views/plan-interview-entry.ts`: `renderPlanInterviewEntry(onStart)`.
- `src/views/plan-interview.ts` is now the ROUTER (`renderPlanInterviewPage`, registration in `section-view.ts` unchanged): chat when `planEntry.phase === "chat"` OR the slice has progress (turn answered / in flight / failed / ready); otherwise the entry screen. "Start interview" swaps the chat in without a route change and focuses the answer field.
- MOVED `src/views/plan-interview-chat.ts` (was `plan-interview.ts` in 12b): `renderPlanInterviewChat()`. **It no longer seeds the slice** from `getPlanCandidates()`; the entry screen owns that via `startInterview(candidates)`.
- `src/styles/plan-interview.css`: `.plan-entry*` (tokens + logical properties).
- `growth-os/i18n/{en,fa}.ts`: `growth.planInterviewPage.entry.{intro, listLabel, counter, row.{label,remove,empty,duplicate}, add.{label,hint,placeholder,button,empty,duplicate,full}, empty.{title,description,nextStep,cta}, start.{idle,hintNone,hintInvalid,hintReady}}`.
- NEW `smoke/plan-interview-entry.test.ts` (22). Updated `smoke/plan-interview-view.test.ts` (boot now mounts the chat view and seeds the slice itself; the "seeds from the hand-off" test became "does not seed the slice itself" + the new intro copy).

## Behaviour
- Rows: editable text, remove (x), add field (Enter adds). 1 to 20, no duplicates (trimmed, case-sensitive: same rule as the `planCandidates` slot, so a list that came over unchanged is always valid). Live counter "N of 20 candidates" (`role="status"`, `aria-live="polite"`). Typing in a row never rebuilds it (focus stays); remove / add rebuild the list and place focus on purpose (neighbour row, else the add field).
- Row problems (blank, duplicate) are shown under the row (`aria-invalid` + `aria-describedby`) and block Start. **Start** is disabled until the list is valid, with an always-visible line saying why (or how many candidates will go in), linked by `aria-describedby`.
- At 20: add field + button disabled, hint says the list is full.
- Empty list: `emptyStateGuide` (why it is empty, next step, "Open Brain Dump" -> `journey.goToRoute("plan/brain-dump")`); the add field stays below, so typing from scratch works.
- **Start interview:** `startFromEntry()` -> `planInterview.set(startInterview(trimmed list))`, phase `"chat"`. It sends NO request. The first turn goes out from the chat with these as `known_candidates` (test checks the wire body).
- Survives a language change: the list lives in `planEntry`, the half-typed add field in the draft store. No `localStorage` / `sessionStorage` writes (the test allows only the app's own theme / language keys).

## Things to know
1. **Optional NextAction picker: SKIPPED.** The client has no list method for NextActions: only `listGoals()` plus `getGoalTree(goalId)` per goal (an N+1 walk), and `client.ts` itself notes the backend has no flat list route. So there is no `candidate_task_ids` mapping in the slice (the slice is unchanged). If you want the picker: add a flat route or client method, then carry `{ text -> id }` in `planEntry` (it must follow edits: an edited or removed text loses its id) and pass it to propose in 12d.
2. **A newer hand-off replaces unsaved edits.** `syncEntryWithHandoff()` re-copies the slot only when `planCandidates.updatedAt` changed (the user clicked "Use these items" in Brain Dump again). Opening the page again or switching language keeps the edits. Edits made here are NOT written back to the `planCandidates` slot (it stays the Brain Dump snapshot).
3. **Copy change on the chat intro:** `introWithCandidates` no longer says "from your Brain Dump" (the list can be typed now): "N tasks are on your list. ..." / fa equivalent.
4. The empty guide shows whenever the working list is empty (also after the user removes everything), not only for an empty slot.
5. 200-character limit on a typed or edited candidate is a UI choice (the backend has none); a longer text that came over from Brain Dump is kept as is.
6. No "back to the list" after Start and no restart once the interview is over (same as 12b point 5). Cheap follow-up: a button that sets phase back to `"entry"` while the slice has no turn yet.
7. Still open from 12a (point 2): `apiClient.planInterview` puts `null` / `[]` on the wire for missing `known_*` values. Unchanged; say so and I fix it with its test.
8. Persian copy is mine: needs a native skim.

- Commit: feat(plan): Plan interview entry screen (editable candidates from Brain Dump or from scratch, validation 1-20 / no duplicates, live counter, Start seeds the interview; chat view split out; fa+en)
