# HANDOFF part 13a: Plan override ("I'll choose myself"), route `plan/interview`, proposal screen

**Run:** `tsc --noEmit` clean (only the known CSS/font side-effect imports in `main.ts`), `check-i18n-parity` OK (880 / 880), slice logic checked with tsx. **NOT run: `vitest run`** (no node_modules / network here); new `smoke/plan-override.test.ts` (~30 tests) and the edited `plan-proposal.test.ts` are unrun. Not seen in a browser. Propose SAVES NOTHING.

## Slice (`planProposal`, `state/plan-proposal.ts`): `result` is now TWO fields
`{ status, activeResult, rankedResult, error }`. `activeResult` = the plan on screen and the ONE to confirm. `rankedResult` = last answer with `source === "ranked"` (same object as `activeResult` until an override). Both are frozen shallow copies, values exactly as returned. A new response REPLACES `activeResult` (its ids are not merged: an override answer has `highlight_task_id` / `decision_id` null). Failure and 429 keep both.

## Where Part 13b reads (all from `planProposal.get().activeResult`, never from `rankedResult`)
`highlight`, `schedule_slot`, `recommended_tactic_id`, `highlight_task_id`, `decision_id`. Simplest: `buildPlanConfirmRequest(logDate, activeResult)` (nulls are left out). Gate Confirm with `canConfirmPlan(slice)` (plan exists and status !== "loading"; a failed override still allows the previous plan).
Plug in at `drawPart13` in `views/plan-proposal.ts` (slot `#plan-part13-slot`, same rule as 12d): replace the disabled `data-plan-part13-confirm` button + the `notSaved` note; keep the override controls (`data-plan-override-*`). Put the Confirm into `syncControls()` so it is disabled while either propose lock runs.

## Behaviour
- Button **I'll choose myself** (`aria-expanded`) -> `<fieldset>` radio group of the OTHER candidates (`overrideChoices`: exact texts, current highlight excluded; none left -> a note, no button). Choice is a radio + explicit **Use this one** (not fired on change, so arrowing through radios sends nothing); nothing selected -> field error. Cancel closes.
- Use this one -> `submitLock("plan-override")` -> `requestPlanOverride(text)` -> propose with the SAME `candidates` / `available_hours` / `energy_window` + `forced_highlight` (+ current `lang`; no `candidate_task_ids`, the backend ignores it there). Skeleton while loading; card shows source **Your choice** (en; fa unchanged "انتخاب خودت"); focus moves to the card; picker closes.
- **Back to the ranked suggestion** (only while `activeResult !== rankedResult`): `restoreRankedPlan()`, from state, no request.
- Errors: `errorMessage` banner; a 500 keeps the previous card under the banner, picker stays open with the choice, **Try again** re-sends the same override (same body, same lang). 429: no banner, "please wait a moment", previous plan kept, controls back after 3 s, keyboard returns to the picker. 401: `handleAuthExpiry`, no retry.
- Two locks (`plan-proposal`, `plan-override`) cover the same endpoint: while one runs every control of the other is disabled; the flow also refuses a request while `loading`.
- Language switch: results, error + Try again, open picker + selection (`state/plan-override-picker.ts`) and an in-flight override all survive; no refetch, no web storage.

## Things to know
1. `result` was renamed to `activeResult` (12d's HANDOFF said `.result`); only the view and tests used it, all updated.
2. Copy changed: en `user_override` "Chosen by you" -> "Your choice"; `next.title` / `next.description` reworded (the "(Part 13)" wording is gone). Persian copy is mine: needs a native skim.
3. Free-text candidates (nothing feeds `candidate_task_ids` yet) give `highlight_task_id: null` already on the ranked answer; 13b must accept nulls (it does, via `compact`).

- Commit: feat(plan): plan override (I'll choose myself: radio picker, propose again with forced_highlight via submitLock, activeResult / rankedResult, back to ranked without a request, errors keep the previous plan; fa+en)
