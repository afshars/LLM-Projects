# HANDOFF part 14c-1: Progress Check, review and confirm (route `reflect/progress-check`)

**Run:** `tsc --noEmit` clean, `check:i18n` OK, `vite build` OK, `vitest run smoke/progress` **127/127 pass** (63 new: 31 state + 32 view). I broke two rules on purpose (kept the confidence after the blocker was changed; stopped the retry button following the lock) and 2 and 5 tests failed, so they bite. **Full suite: 1345 pass, 17 fail, all in `smoke/plan-confirm-feedback.test.ts`; the same 17 fail on the untouched 14b zip (checked), not caused by this part.** Not seen in a browser (CSS, both themes, RTL need a visual pass).

## Files
- NEW `state/progress-confirm.ts`: pure. `buildProgressConfirmBody(result, edits, today)`, `progressEditErrors`, `parseMinutes`, panel items (`progressEditItems`, stable per result), `canRetryProgressConfirm`, slice transitions.
- NEW `state/progress-confirm-flow.ts`: `requestProgressConfirm(edits, today)`, the ONLY caller of `apiClient.confirmProgressCheck`.
- NEW `views/progress-check-confirm.ts`: `createProgressConfirm(nav)` fills `#progress-check-review`.
- CHANGED `state/progress-check.ts`: slice gets `confirmStatus` (idle | submitting | success | error), `confirmError` (ApiError), `confirmResult`, `confirmedBody`; `NO_CONFIRM`. A new check result or a failed check resets them. `canSubmitProgressCheck` is false while a save runs.
- CHANGED `views/progress-check.ts` (controller wiring; check button, textareas and "Edit my text" off while saving), `views/progress-check-result.ts` (slot markers only), `growth-os/i18n/{en,fa}.ts` (`growth.progressCheckPage.confirm.*`, 19 keys), `styles/progress-check.css`.
- CHANGED test `smoke/progress-check-result-view.test.ts` (1 test: the review slot is no longer empty; markers are now `14c-1` / `14c-2`).

## Behaviour
- **Contract:** body = `log_date`, `accomplishments_text` (required) + `blocker_type`, `blocker_confidence`, `recommended_tactic_id`, `next_action_fa`, `next_action_duration_min`. Only keys with a value; never null / undefined / "". `recommended_stage` is never sent (not in the schema). Only `/chains/progress-check/confirm` saves; the check never does (tested: 0 confirm calls before the click).
- **Editable:** accomplishments (starts as `slice.result.request`, the text that was checked, not the drafts), blocker (select: none + 5 types), next step, minutes. NOT editable: `recommended_tactic_id` (passed back unchanged) and `blocker_confidence` (the model's number; sent only while the blocker is still the detected one, dropped if the user picks another type or "none").
- **Notice:** the panel's own "Nothing is saved until you confirm" (`ui.review.notSaved`, already fa + en), visible while idle, submitting and after an error. It is gone after a successful save (it would be false).
- **Submit:** the panel's `submitLock`: every panel button disabled, `aria-busy` on the panel, the Confirm button and the slot. Second click sends nothing. A language switch mid-request re-binds and delivers to the new view.
- **Errors** (`errorMessage(err, "save")` at render time; the slice stores only the ApiError): 400/422 generic "check your input" (server text never shown), 500 server, network, 401 -> `handleAuthExpiry` to login (no retry), 429 -> "please wait a moment" in the panel, no alert, nothing stored. Edits stay, buttons come back, **Try again** re-clicks the panel's Confirm (same lock, CURRENT edits). Retry is also shown for 400/422 on purpose (the user may have just fixed the field).
- **Success:** `role="status"` message, focused once when the save happens (not after a language switch), + "Go to Today" (`journey.goTo("DAILY_PLAN")`) and "See weekly Growth" (`journey.goToRoute("reflect/weekly-growth")`). Calls `invalidateDailyPlan()` like Plan confirm.
- **Language switch:** edits (panel draft + field drafts), error (re-translated from its kind) and success survive; no request (tested: check and confirm counts).
- **For 14c-2:** `#progress-check-next-action` (`data-part="14c-2"`, `data-slot="next-action-button"`, with a comment) is untouched and still empty. It lives inside the result card, so it exists before and after saving; read `progressCheck.get()` (`result`, `confirmStatus`) to decide when to show the button.

## To know
- **Signature differs from the brief:** `buildProgressConfirmBody(result, edits, today)` has a third argument. `log_date` is required by the schema and the function must stay pure, so the date comes in (same as `buildPlanConfirmBody`).
- **Backend caveat (not changed):** `confirm_progress_check` assigns blocker_type, blocker_confidence, next_action and duration straight from the body, so an omitted key CLEARS an existing value on that day's log (only `recommended_tactic_id` is guarded). Fine for a first save; a re-save after clearing the blocker will erase it. Say if the backend should guard those too.
- **UI rules I added (not in the schema):** minutes must be a whole number 1..1440; accomplishments max 2000 (same as the check). Persian / Arabic-Indic digits are accepted for minutes.
- The panel hint still says "edit or remove anything"; there is no Remove here (`removable: false`). It is shared copy in `ui.review.notSavedHint`; I did not touch it.
- "See weekly Growth" opens a route that is still the shell placeholder.
- Persian copy is mine (native skim: `confirm.*` in `fa.ts`).
- Commit: feat(reflect): progress check review and confirm (buildProgressConfirmBody, confirmStatus slice, submitLock, errorMessage errors with retry, success with Today / weekly Growth, 14c-2 slot kept; fa+en)
