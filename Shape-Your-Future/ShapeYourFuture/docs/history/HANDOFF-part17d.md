# Part 17d — User intelligence: Goals tab (HANDOFF)

Edits the mentor's model of the user's goals (`/user-intelligence/goals`). It is NOT the planning goals of the Goals section (`/goals/*`); nothing here calls those. The tab says so in one hint sentence.

**Verified**
- `tsc --noEmit`: only the 10 errors already in the zip (missing 17b files, see below). Nothing new.
- `check:i18n` OK (fa = en structure).
- 68 new tests pass under vitest + jsdom (29 pure in `smoke/goal-lists.test.ts`, 39 view/flow in `smoke/my-profile-goals-view.test.ts`, with a fake backend that follows `update_user_goal`). I broke the code 10 different ways (removal via mode `remove`, null for a cleared focus, ignoring server changes after save, partial failure not recorded or not written, no duplicate check, draft re-read from data, no focus warning, Save not locked, move not reordering): every one is caught.
- Full suite: 62 failures in the same 4 files as on the untouched zip (my-profile-form-view, my-profile-save-state, my-profile-save-view, plan-confirm-feedback); 1683 -> 1751 passing.

**Not verified**
- How it looks: no browser here. Check both themes, RTL, 375px, and the auto-growing textarea (`field-sizing: content` with `rows=1`; older browsers fall back to one row plus the resize handle).
- Screen-reader output. Persian copy is mine: skim `growth.myProfilePage.goalsForm` in `fa.ts`.

## Zip problem (unchanged from 17c)
`state/ui-profile-form.ts`, `state/active-hours.ts`, `views/my-profile-active-hours.ts` (17b) are still missing from the zip. Re-send them.

## Schema findings (read from the backend, not guessed)
Files: `schemas/user_intelligence.py` (`UserGoalsOut`), `api/routes/user_intelligence.py` (`UpdateGoalRequest`), `services/user_intelligence.py` (`update_user_goal`), `db/models.py` (`UserGoalProfile`).
- **Groups are lists of plain strings** (`list[str]`): no ids, no objects. **Order is stored** (JSON list) and returned as stored, so reordering is saveable.
- **`current_focus_goal` is `str | None`, free text.** The server never checks it against the lists and never clears it when a list item goes away. So the UI does not couple them: a text field with the draft's goals offered as `<datalist>` suggestions, and no select.
- **PUT is NOT one body with several groups.** `{ goal_type, value: str | list[str], mode }` changes ONE group per request. A save is therefore one request per changed group, in fixed order (four lists, then focus), not atomic as a whole.
- **Removal:** mode `"set"` (value = the whole new list) is the one mode that carries a removal, a rename AND a reorder in one atomic write per group. `"remove"` drops by value (every equal item) and cannot reorder; `"add"` cannot remove. The UI always sends `set` for lists. `value` for `set` MUST be a list: a bare string is split into characters by `list(value)`.
- **Clearing the focus:** `null` is a 422. **`""` is accepted** and stored as `""` (GET then answers `""`, not `null`). So a clear is sent as `""`, and `""` / `null` / spaces all read as "no focus". (17a-1's note said the focus cannot be cleared: it can, with `""`.)
- No length limit, item-count limit or trimming anywhere. The UI trims, drops blank rows, and refuses duplicates inside one group (the server's `add` skips repeats and `remove` drops every equal item, so a repeat has no meaning). Exact, case-sensitive match after trimming, like the server. The same text in two different groups is allowed.
- `diffForPartialPut(normalizedData, normalizedDraft, { nullable: ["current_focus_goal"] })` decides which keys changed (its `null` is translated to `""` when the request is built). `user_id` never takes part.

## Behaviour I chose (the safe reading)
1. **Focus vs a removed goal:** the server has no rule, so nothing is cleared. If the focus text equals a saved list item that is no longer in any list of the draft, a warning says it stays the focus until changed or cleared (`#my-profile-goals-focus-note`, linked by `aria-describedby`). It goes away when the goal returns, the focus changes, or after the save.
2. **Partial failure:** the last successful answer (it holds every group) is written into the slice first; the draft keeps only what is still unsaved (`draftAfterSave`). The error box shows `errorMessage(err, "save")` plus "Saved: A. Not saved yet: B, C.". "Try again" re-diffs, so it sends only the rest.
3. **Chat edits meanwhile:** groups the user did not touch take the server's value after a save; edited groups are never overwritten; typing while a save runs is kept and stays unsaved.
4. **Blank rows** are ignored when saving (not an error); adding one alone does not enable Save but does offer Discard. Duplicate errors are live (both rows flagged, `aria-invalid`, linked message).
5. The slice-level `isEmpty` of the Goals tab is now always false: every group has its own empty text + Add button, and the page-level chat hint is always shown. `panels.goals.ready` reworded (no longer used by the tab).
6. "Open chat" is a button styled as a link (`journey.goTo("CHAT")`), like every other navigation in the app.

**Decisions for you**
- **Lost update:** `set` replaces the whole list. If the chat adds a goal to a group the user also edited, and the tab has not reloaded, the chat's addition is overwritten. The alternative (per-item `add` / `remove`) cannot reorder and needs many more requests. Cheap mitigation for the chat part: call `invalidateUiGoals()` after it writes goals (nothing calls it yet), and/or add a Refresh button to the tab.
- Duplicates are refused. If you would rather silently drop them, change `validateGoalLists` and normalize in `cleanGoalList`.
- The goal text field is a `<textarea>` (a goal can be a sentence); Enter inserts a line break, the text is trimmed at the ends only.

## Files
New (`frontend/…`): `src/lib/ui/string-list-editor.ts`, `src/state/goal-lists.ts`, `src/state/ui-goals-save.ts`, `src/state/ui-goals-save-flow.ts`, `src/views/my-profile-goals.ts`, `src/views/my-profile-goals-save.ts`, `smoke/goal-lists.test.ts`, `smoke/my-profile-goals-view.test.ts`.
Changed (also in `existing-files-17d.patch`): `src/lib/ui/index.ts` (exports), `src/views/my-profile-tabs.ts` (Goals tab), `src/growth-os/i18n/en.ts` + `fa.ts` (`myProfilePage.goalsForm`; `panels.goals.ready`), `src/styles/components.css` (`.ui-list*`), `src/styles/my-profile.css`.
No change to the store, `UiSlice`, `api/*` or `diffForPartialPut.ts`: the draft is a plain copy of `UserGoalsOut` (default codec).

## Exported names
- `lib/ui` (also from `lib/ui/index.ts`): `stringListEditor<C>(o): { node, getItems(), setErrors(errors), focusFirstError(), focusAdd() }`; options `{ id, items, errors?, labels, formatNumber?, reorderable?, onChange(items), onCommit?(items, index|null) }`; types `StringListEditorLabels` (`list, row, remove, removeLabel, moveUp, moveDown, moveUpLabel, moveDownLabel, add, empty, rowAdded, rowRemoved, rowMoved, errors, placeholder?`; `{n}`, and `{to}` `{total}` in `rowMoved`), `StringListRowError`, `StringListEditorHandle`, `StringListEditorOptions`. Ids: `#<id>`, `-list`, `-empty`, `-add`, per row `-<i>-text|remove|up|down|error`.
- `state/goal-lists.ts`: `GOAL_LIST_KEYS`, `GOAL_FOCUS_KEY`, `GOAL_KEYS`, `isGoalListKey`, `cleanGoalList`, `cleanGoalFocus`, `normalizeGoals`, `validateGoalLists`, `moveGoalItem`, `sameGoalKey`, `computeGoalsPut(data, draft) -> { changed, dirty, requests: UpdateUserGoalRequest[], keys }`, `focusLeftBehind`, `goalSuggestions`, `draftAfterSave`; types `GoalListKey`, `GoalKey`, `GoalErrorCode`, `GoalItemError`, `GoalListErrors`, `NormalizedGoals`, `GoalsPutPlan`.
- `state/ui-goals-save.ts`: `getUiGoalsSaveFeedback`, `setUiGoalsSaved`, `setUiGoalsDiscarded`, `noteUiGoalsPartialSave`, `setUiGoalsSaveError`, `clearUiGoalsSaveFeedback`, `takeFreshUiGoalsFeedback`, type `UiGoalsSaveFeedback`.
- `state/ui-goals-save-flow.ts`: `sendUiGoalsSave()` (lets the ApiError propagate for submitLock; resolves null when nothing was sent), `discardUiGoalsEdits()`, `canSaveGoals()`.
- `views/my-profile-goals.ts`: `renderGoalsTab(data)`, `redrawGoalsEditors()`, `revealGoalErrors()`, `goalEditorId(key)`, ids `GOALS_FORM_ID`, `GOALS_CONTENT_ID`, `GOALS_HINT_ID`, `GOALS_CHAT_ID`, `GOALS_FOCUS_ID`, `GOALS_SAVE_SLOT_ID`.
- `views/my-profile-goals-save.ts`: `renderGoalsSaveArea({ redrawEditors, revealErrors })`, `goalsSaveId(part)`, `GOALS_SAVE_LOCK_KEY`; ids `#my-profile-goals-save-button|discard|retry|problems|hint|status|error|wait|changes`.
- i18n: `growth.myProfilePage.goalsForm` = `{ formLabel, hint, chat, groups.<key>{ title, description, editor }, focus{ title, label, hint, placeholder, leftBehind(goal) }, errors.duplicate, save{ … willSave(names), partial(saved, notSaved), listSeparator } }`.
