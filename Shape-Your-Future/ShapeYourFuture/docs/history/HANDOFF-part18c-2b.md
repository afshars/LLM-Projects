# Part 18c-2b — User intelligence B: Habits discard, completeness overview, language-change check (HANDOFF)

**No source file was changed.** All four items were checked in the code; items 1, 3 and 4 already hold from 18c-2a, and item 2 has nothing to fix because no view renders the completeness overview. The only new file is a regression test (`smoke/ui-habits-discard-completeness.test.ts`) that pins the behaviour, plus this note.

Files opened: the three HANDOFFs, `views/my-profile-habits.ts`, `my-profile-habits-save.ts`, `my-profile-tabs.ts`, `my-profile.ts`, `state/ui-habits.ts`, `ui-habits-save.ts`, `ui-habits-save-flow.ts`, `ui-save-core.ts`, `user-intelligence.ts`, `ui-section-completeness.ts`, the `habitsForm` / `panels.habits` parts of `en.ts` and `fa.ts` (and `scripts/check-i18n-parity.ts` to run the parity check). One grep, as allowed.

## 1. Discard changes — already built in 18c-2a; one decision for you
`#my-profile-habits-save-discard` sits next to Save (`renderHabitsSaveArea`). Pressing it calls `discardUiHabitsEdits()` = `resetUiHabitsDraft()` (draft = deep copy of `uiHabits.data`, `data` untouched) + `uiHabitsFeedback.setDiscarded()` (replaces any error or "saved" line with "Changes discarded."), then `redrawHabitsForm()` (clears the "touched" / "show all" error reveal and repaints the form from the draft). **No request:** neither function imports or calls `apiClient` (the file `ui-habits-save-flow.ts` does import it, but only `sendUiHabitsSave` uses it). It is disabled while a save runs.

**Deviation from your wording: the button is shown when the draft is `dirty`, not when `changed` is true.** `changed` means "something would be sent"; `dirty` means "the draft differs from the data in any way". `changed` implies `dirty`, so every case you listed still shows the button. They differ in exactly two cases (checked by running the code, and pinned in the new test):
- the user **empties a saved scalar** (e.g. sleep hours): `changed: false`, `dirty: true`, and the form shows the `cleared` error;
- the user adds only a **blank list row**: `changed: false`, `dirty: true`.

With `changed`, the button would disappear in the first case, which is the moment someone with an invalid form most needs a way back (Save is disabled and the only other exit is retyping the old value). I kept `dirty`. If you want the literal rule, it is one line in `refresh()` of `views/my-profile-habits-save.ts`: `discardBtn.hidden = !plan.dirty` -> `!plan.changed`. I did not change it.

## 2. Completeness overview
- **Grep result:** `getUiSectionCompleteness` is defined in `state/ui-section-completeness.ts`, used by tests only (`smoke/ui-section-completeness.test.ts`) and named in HANDOFF 18a. **No view renders a completeness overview, so I did not build one.**
- **How it reads the Habits slice:** `getUiSectionCompleteness(userIntelligenceStore.get())` reads only `slices.uiHabits.data`, never the draft. After a successful save `commitUiSave` runs `userIntelligenceStore.set("uiHabits", ...)`, which replaces the state object and emits `"uiHabits"`; `data` is the server's answer. So a fresh call sees the saved habits with no refetch. Nothing is stale; **nothing was changed.**
- **For whoever builds the overview:** call `getUiSectionCompleteness(userIntelligenceStore.get())` at draw time (do not keep an old `get()` result) and redraw on `userIntelligenceStore.subscribe` for `"uiHabits"` / `"all"`. Show nothing for `"unknown"`.
- Verified by running the real modules (node, no vitest): unloaded -> `unknown`; blank load -> `empty`; draft edit alone -> still `empty`; after `commitUiSave` -> `filled` with 0 fetches; save that removes the last value -> `empty`; answer for an invalidated slice is refused and the section is `unknown`.

## 3. Language-change check (by reading the code)
No violation found; nothing changed.
- **No refetch:** `renderHabitsTab`, `renderHabitsSaveArea` and `renderMyProfilePage` contain no request. The only request code in the Habits path is `sendUiHabitsSave`, called only from the Save / Try again click.
- **Draft not reset:** `renderHabitsTab` reads `slice().draft ?? data` and never writes the draft while building. The error-reveal state (`touched`, `showAll`) is reset only when `data` is a *different object* than last time (a new answer), not on a rebuild.
- **Errors re-translate:** field errors are `HabitErrorKey`s (`validateUiHabitsDraft`), turned into text in `errorText` at draw time. The save error is stored as the `ApiError` (`uiHabitsFeedback.setError(err, sentCategories)`; a non-ApiError becomes kind `unknown`, message `""`) and drawn through `errorMessage(f.error, "save")`; the 422 summary stores category ids and `summarySections(list(sent))` translates them at draw time.
- **Success message re-translates:** the store holds only `{ phase: "saved" }`; the text is `copy().saved` at draw time. The focus-once flag is consumed on the first draw, so a rebuild does not steal focus again.
- **Not opened (outside your list), so these links rest on the HANDOFF text, not on code I read:** `views/my-profile-slice-tab.ts` (loads a slice only when `idle`), `lib/ui/submit-lock.ts` (restores a running save on the newest binding), `lib/dom.ts` (`errorMessage` translates at call time), `app.ts` (rebuilds the view). If you want these four confirmed from code too, name them and I will read them.

## 4. i18n
Every key used by the Save area exists in both languages, none empty: `habitsForm.save.{areaLabel, save, saving, discard, saved, discarded, noChanges, fixFirst, showProblems, retry, listSeparator, willSave(names), summaryTitle, summarySections(names), summaryKept}`, plus `habitsForm.sections.<cat>.title` and `panels.habits`. This part needed **no new key** (the Discard button and its messages were added in 18c-2a). The real `scripts/check-i18n-parity.ts` (run on tsc output): **OK, en 1678 / fa 1678**, no missing keys, no empty values, no placeholder / argument mismatch, no untranslated duplicates.

## Verified
- New test `smoke/ui-habits-discard-completeness.test.ts`: 13 tests, all pass. I ran them with a throwaway vitest stand-in (no vitest / jsdom here); the file also type-checks under `--strict`. Run `npx vitest run` once for the real runner.
- i18n parity as above.

## Not verified
- No browser, no screen reader, no jsdom run of `my-profile-habits-save-view.test.ts` / `my-profile-habits-view.test.ts` (still unrun since 18c-2a), no full `tsc -b` (no `node_modules`).
- Persian copy is still mine (`habitsForm.save` in `fa.ts`).

## Left undone
1. `dirty` vs `changed` for Discard: your call (see item 1).
2. No completeness overview exists to update; building one is a separate part.
3. Open from earlier parts, unchanged: `HABITS_CLEAR_IS_ERROR = true`; Energy save still has its own commit copy; `profile/habits` and `profile/energy` placeholder routes.

## 5-step manual check
1. Open My profile > Habits. In Sleep, type 7 in "hours" and set Exercise "type" to `run`. Check: the line "Will be saved: Sleep, Exercise." appears, Save and "Discard changes" are both enabled.
2. Press Save. Check: "Habit details saved." appears (focus moves to it), Discard disappears, Save is disabled ("No changes to save."). In DevTools > Network exactly one `PUT .../user-intelligence/habits` went out, with only the changed keys, and no GET followed.
3. Edit a field again, then switch the language (fa <-> en). Check: the tab, the typed value and the "Will be saved" line are still there, the labels are in the new language, and Network shows no new request. Then force an error (e.g. go offline and press Save): the error text is in the current language; switch language again and it re-translates, with Try again still there and the draft untouched.
4. Press "Discard changes". Check: the fields go back to the saved values, field errors and the error box are gone, "Changes discarded." shows, and Network shows no request. Then empty a saved field: Discard must still be offered while the "cleared" error shows.
5. Overview: there is no completeness overview in the app yet, so there is nothing to look at on screen. Confirm that by searching for `getUiSectionCompleteness` (only tests use it). When one is built, saving Habits from empty to a value must flip its Habits entry to filled without a reload.

## Files
New (`frontend/…`): `smoke/ui-habits-discard-completeness.test.ts`. New (root): `HANDOFF-part18c-2b.md`. Changed: none.
