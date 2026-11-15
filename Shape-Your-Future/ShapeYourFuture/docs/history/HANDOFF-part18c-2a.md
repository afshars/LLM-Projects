# Part 18c-2a — User intelligence B: Habits tab, save request and error handling (HANDOFF)

Builds on 3 (shared UI: submitLock), 17a-1 (slices, diffForPartialPut), 18b (the Energy save this one follows), 18c-1 (Habits form, validation, empty Save slot). The patch is relative to the 18c-1 state.

## Schema findings (read from the backend, not guessed)
Files read: `api/routes/user_intelligence.py` (`UpdateHabitsRequest`, `PUT /habits`), `services/user_intelligence.py` (`update_habit_profile`), `schemas/user_intelligence.py` (`HabitProfileOut`).
- **PUT body** `UpdateHabitsRequest`: `sleep | exercise | food | work | learning | leisure`, each `dict | None`, applied with `model_dump(exclude_unset=True)`. **Response** `HabitProfileOut { user_id, <six dicts> }` (all categories, merged).
- **Merge:** for each category in the body that is a dict, `dict.update()` into the stored dict (SHALLOW). A category that is `null` / not a dict is ignored. `{}` changes nothing.
- So a **partial body at KEY level inside a category is safe** (the other keys of that category stay), and a **list value is replaced whole**.

## What is sent, and how clearing / removal is sent
- **Body** = `computeHabitsPut(data, draft).body`: only the CHANGED categories, each holding only its CHANGED keys, each key sent whole. `diffForPartialPut` runs once per category on the normalized draft, so the contract (no `undefined`, no `null`, deep compare, untouched = not sent) is the helper's. `user_id`, unchanged categories and unknown keys (`date`, chat-written) are never sent. Not `nullable`.
- **Null: never sent. The schema does not require it anywhere** (a null category is ignored by the service; a null VALUE inside a category would be stored as a value, not clear it).
- **A list item is removed** by sending the FULL new list for that key (`food: { restrictions: ["milk"] }`). **A list is emptied** with `[]` (only when the server holds that key; an empty list the server does not hold is not sent). Reordering is a change.
- **A scalar can NOT be removed or cleared** (no way in this API: omitting the key keeps it, null is stored as a value). The form already refuses it (18c-1 `validateUiHabitsDraft` -> `cleared`, `HABITS_CLEAR_IS_ERROR = true`), so Save stays disabled and nothing is sent. Unchanged decision; see "Left undone".
- Before diffing, `normalizeHabitsDraft` trims text, drops blank list rows and blank scalars. A value that is exactly what the server holds is never touched (a saved `"Run "` is not "changed" to `"Run"`).
- No other store is invalidated after a save: nothing reads habit keys (planner, daily plan, behavior).

## Behaviour
- **Save** (`#my-profile-habits-save-button`): disabled when `changed` is false, when `validateUiHabitsDraft(draft, data)` has errors, or while submitting (`submitLock`, key `my-profile-habits-save`). Sends `body` only. A line above the buttons names the sections that will be saved; the hint under them says why Save is disabled (`aria-describedby`). "Show what needs fixing" and an invalid Save press call `revealHabitsErrors()`. Discard is shown while the draft differs from the data and calls `redrawHabitsForm()`.
- **Success:** `uiHabits.data` = the server's answer, draft = a copy of it (`applySaved` semantics through `commitUiSave`), `<p role="status">` "Habit details saved." (focused once). What the user typed while the request ran is kept; an answer for a slice invalidated/reset meanwhile is not written. A 200 answer that is not six dicts rejects with kind `unknown` and changes nothing.
- **Errors:** the flow lets the `ApiError` propagate; `onSettled` (newest binding, so it survives a language change mid-request) stores it with `uiHabitsFeedback.setError(err, sentCategories)` and draws `errorMessage(err, "save")` in `role="alert"`: 400/422 "check your input", 401 session expired (goes to login through `handleAuthExpiry`, no retry button), 429 "please wait a moment" (the lock's own line, no error box), 500, network. The ApiError (`kind`) is stored, never text: a language change re-translates it. Draft stays; **Try again** (not on 401) re-runs the same save from the current draft.
- **422:** the same `role="alert"` box becomes a validation summary: title, errorMessage text, "Sections being saved: …" (the categories of the failed body), "Your changes are still here…". (Same shape as the Profile save; the server's detail text is never shown.)
- Language change: rebuild from the same draft and the same feedback, no refetch.

## The shared helper (written in this part, because the Energy flow is not generic)
`state/ui-save-core.ts` (no fetch, no DOM, no text), for slices whose draft is a plain copy of `data` (uiProfile, uiGoals, uiEnergy, uiHabits):
- `beginUiSave(slice, draft) -> UiSaveSnapshot` and `commitUiSave(snapshot, answer, beforeApply?) -> boolean`: the generation guard, "typed while saving is kept", "draft = copy of the answer".
- `createUiSaveFeedback(route) -> UiSaveFeedbackStore` (`get`, `setSaved`, `setDiscarded`, `setError(err, sent?)`, `clear`, `takeFresh`); cleared when the user leaves the page / logs out. Types `UiSaveFeedback`, `UiSaveSnapshot`, `CopyDraftSliceName`.

## Exported names
- `state/ui-habits.ts` (added): `computeHabitsPut(data, draft) -> { changed, dirty, body }`, `normalizeHabitsDraft(draft, original?)`, types `HabitsPut`, `HabitsPutBody`.
- `state/ui-habits-save.ts` (new): `uiHabitsFeedback`.
- `state/ui-habits-save-flow.ts` (new): `sendUiHabitsSave()` (resolves the answer or `null` when nothing valid to send; rejects with the ApiError), `discardUiHabitsEdits()`, `canSaveHabits()`, `lastHabitsSaveAttempt()`.
- `views/my-profile-habits-save.ts` (new): `renderHabitsSaveArea({ redrawForm, revealErrors })`, `habitsSaveId(part)`, `HABITS_SAVE_LOCK_KEY`. Ids: `#my-profile-habits-save-button | -discard | -retry | -problems | -hint | -status | -error | -wait | -changes`.
- i18n (fa + en, `fa` typed against `en`): `growth.myProfilePage.habitsForm.save` = `{ areaLabel, save, saving, discard, saved, discarded, noChanges, fixFirst, showProblems, retry, listSeparator, willSave(names), summaryTitle, summarySections(names), summaryKept }`. No error strings here: they come from `errorMessage`.

## Verified
- `tsc --noEmit`: nothing new. The only errors are the ones already in the zip (15 in `main.ts` from the missing `node_modules`, 10 from the three 17b files still missing: `state/ui-profile-form.ts`, `state/active-hours.ts`, `views/my-profile-active-hours.ts`).
- i18n parity (the real `scripts/check-i18n-parity.ts`, run on tsc output): OK, 1678 / 1678.
- `smoke/ui-habits-save.test.ts`: 28 tests (13 body, 12 flow with the real store and a stubbed fetch, 1 helper, plus per-status rows 422 / 400 / 401 / 429 / 500 / network). All pass, run with a throwaway vitest stand-in (no vitest / jsdom / network here). Mutation checks: sending the whole category (7 fail), ignoring "typed meanwhile" (1 fails), skipping the generation check (1 fails); each caught.

## Not verified
- **`smoke/my-profile-habits-save-view.test.ts` (jsdom, 18 tests) was written but NOT run** (no jsdom here). It follows `my-profile-energy-view.test.ts` closely. Run `npx vitest run` once. No browser, no screen reader, no visual pass (the CSS classes are the existing `my-profile-save__*` ones; nothing new was added).
- `smoke/my-profile-habits-view.test.ts` was edited (two 18c-1 tests asserted an empty slot and "no Save button"; they now assert the Save area is in the slot and that editing alone sends nothing). Not run either.
- Persian copy is mine: skim `habitsForm.save` in `fa.ts`.

## Left undone / decisions for you
1. `HABITS_CLEAR_IS_ERROR = true` is unchanged: a saved scalar can't be emptied (the API can't remove it). If you accept `null` as "cleared", it would have to be a deliberate, separate change (null is stored as a value; nothing reads habits).
2. The Energy save (18b) still has its own copy of the commit code and feedback store. It could move onto `ui-save-core.ts`; I did not touch a verified part.
3. The 422 summary names the SECTIONS that were being saved, not the field: the server's `detail` is not field-mapped for this route and is never shown.
4. `profile/habits` and `profile/energy` are still placeholder routes in the section registry (open since 17a-2).
5. I read a few files beyond your list because the code needed them: `state/user-intelligence.ts` (store / `uiApplySaved`), `lib/dom.ts` (`errorMessage`), `views/my-profile-profile-save.ts` (the existing 422 summary), `views/my-profile-energy.ts` (how the area is mounted), and the existing habits / energy tests. Nothing else was searched.

## Files
New (`frontend/…`): `src/state/ui-save-core.ts`, `ui-habits-save.ts`, `ui-habits-save-flow.ts`, `src/views/my-profile-habits-save.ts`, `smoke/ui-habits-save.test.ts`, `smoke/my-profile-habits-save-view.test.ts`.
Changed (also in `existing-files-18c-2a.patch`): `src/state/ui-habits.ts`, `src/views/my-profile-habits.ts`, `src/growth-os/i18n/en.ts`, `src/growth-os/i18n/fa.ts`, `smoke/my-profile-habits-view.test.ts`.
