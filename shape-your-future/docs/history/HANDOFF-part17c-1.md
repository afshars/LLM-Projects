# Part 17c-1 — Preferences tab: KeyValueEditor, pure conversions, draft rows (HANDOFF)

Editing only. NO save logic (17c-2). No new API call (uses the 17a-1 `uiPreferences` slice).

**Verified:** `tsc --noEmit` (strict) clean on `src/` except the errors that were already in the zip (see "Zip problem"); 22 pure tests pass (`smoke/preference-rows.test.ts`, own runner + vitest shim); 45 checks pass in real Chromium (375px, stubbed API): ARIA names with row number, focus after add / remove / type change / empty guide, typing never redraws, duplicate on both rows, number + Persian digits, language change = no refetch + no input loss + errors re-translated, discard, reveal, no horizontal scroll with 300/400-char text, fa/en parity of the new copy.
**Not verified:** vitest itself (`smoke/my-profile-preferences-view.test.ts` is the same scenarios for jsdom, written but NOT run: no jsdom here); how it looks in both themes; screen-reader output. Persian copy is mine: have a native speaker skim `growth.myProfilePage.preferencesForm` in `fa.ts`.

## Zip problem (not from this part)
The uploaded zip is MISSING the 17b-1/17b-2 files that other files import: `state/ui-profile-form.ts`, `state/active-hours.ts`, `views/my-profile-active-hours.ts`. Baseline `tsc` already fails on `state/ui-profile-save.ts` and `views/my-profile-profile-form.ts` (10 errors) before and after my change. I did not recreate them (would be guessing). Re-send them from the 17b-1/17b-2 output.

## Contract found in the backend (not guessed)
- GET/PUT `/user-intelligence/preferences`: route body is a bare `dict`; service does `merged.update(body)`.
- **Value types: unconstrained.** Any JSON (string, number, boolean, null, array, object). UI edits string / number / boolean. null, array, object (and a non-finite number) = read-only row (`locked`), original kept in `raw`, round-trips unchanged.
- **Max key length: none** (route, service, TEXT column, `MemoryRecord.key`). `PREFERENCE_KEY_MAX_LENGTH = null`; `validatePreferenceRows(rows, { maxKeyLength })` can enforce one, default off. **Decision for you:** keep it unlimited, or give me a number.
- null is stored as a value (does not clear a key), so the editor never sends null.
- **REMOVAL CANNOT BE SAVED.** The server only merges: a key missing from a PUT stays. Same for renaming (old key stays). The Remove button works on the draft only. 17c-2 needs a decision: warn "removed preferences come back after saving", or ask for a backend delete/replace. `diffForPartialPut(data, rowsToDict(draft))` will never show a removal as a change to send.

## Files
New (`frontend/…`): `src/lib/ui/key-value-editor.ts`, `src/state/preference-rows.ts`, `src/views/my-profile-preferences.ts`, `smoke/preference-rows.test.ts`, `smoke/my-profile-preferences-view.test.ts`.
Changed (also in `existing-files-17c-1.patch`): `src/lib/ui/index.ts` (exports), `src/state/user-intelligence.ts` + `user-intelligence-flow.ts` (slice draft shape), `src/views/my-profile-tabs.ts` (Preferences tab), `src/growth-os/i18n/en.ts` + `fa.ts` (`myProfilePage.preferencesForm`; `panels.preferences.ready` reworded), `src/styles/components.css` (`.ui-kv*`), `src/styles/my-profile.css`.

## Store change (read this before 17c-2)
`uiPreferences.draft` is now a **`PreferenceRow[]`**, not a dict (a dict cannot hold a blank or repeated key while typing). `UiSlice<T, D = T>` + optional `UiDraftCodec` on `uiApplyLoaded / uiApplySaved / uiResetDraft`; other slices unchanged (default codec = deep copy). `data` stays the dict. Built once from `data` (first load, save, discard); a refresh replaces the draft only if it has no unsaved edit (a blank new row counts as an edit). For the diff: `diffForPartialPut(slice.data, rowsToDict(slice.draft))`, no `nullable`.

## KeyValueEditor (`lib/ui`, also exported from `lib/ui/index.ts`)
```ts
keyValueEditor<R extends KeyValueRow, C extends string = string>(o: {
  id: string; rows: readonly R[]; newRow: () => R;
  convertType?: (row: R, type: KeyValueType) => R;
  types?: readonly KeyValueType[];                 // >1 shows a type select per editable row
  errors?: readonly KeyValueRowErrors<C>[];        // { rowId, key?: code, value?: code }
  labels: KeyValueEditorLabels;                    // list,row,keyLabel,valueLabel,typeLabel,remove,removeLabel,add,lockedNote,types,booleanOptions,rowAdded,rowRemoved,errors{code->text},keyPlaceholder?,valuePlaceholder?  ({n},{key} filled)
  onChange: (rows: R[]) => void;                   // every edit/add/remove; typing does not redraw
  onCommit?: (rows: R[], rowId: string | null) => void; // field left / remove / retype (null after remove)
}): { node; getRows(); setErrors(errors); focusFirstError(): boolean; focusAdd() }
KeyValueRow = { id; key; value: string; type: "string"|"number"|"boolean"; locked?; lockedText? }
```
No state of its own between builds; all text comes in via `labels`. Ids: `#<id>`, `-list`, `-add`, per row `#<id>-<rowId>-key|value|type|remove|key-error|value-error`.

## Exported functions (`state/preference-rows.ts`)
`dictToRows(dict)`, `rowsToDict(rows)` (order kept, keys trimmed, blank key / unparsable number skipped, locked → `raw`, `__proto__` safe), `validatePreferenceRows(rows, { maxKeyLength? }) → { valid, errors }` (codes: `keyRequired, keyDuplicate` (on EVERY row sharing the key), `keyTooLong, valueNotNumber, valueNotBoolean`; text rows accept anything incl. empty), `withPreferenceType`, `parsePreferenceNumber` / `normalizeNumberText` (Persian digits and ٫ accepted), `newPreferenceRow`, `PREFERENCE_VALUE_TYPES`, `PREFERENCE_KEY_MAX_LENGTH`, `PREFERENCES_DRAFT_CODEC`, `preferenceRowsSignature`. Types `PreferenceRow` (adds `raw`), `PreferenceErrorCode`.

## Tab view (`views/my-profile-preferences.ts`) and slot for 17c-2
- `renderPreferencesTab(data)` is the tab's `renderReady`; the tab's `isEmpty` is now always false: the view shows its own `emptyStateGuide` (what preferences are for, "Add first preference", plus "Open chat") when the DRAFT has no rows; the button adds a row and focuses its name field; removing the last row brings the guide back and focuses its button.
- **>>> `#my-profile-preferences-save` (`data-slot="save"`, constant `PREFERENCES_SAVE_SLOT_ID`) is the empty container for the Save area AND the change summary (17c-2).** It sits inside `<form id="my-profile-preferences-form">` (Enter never submits).
- For 17c-2: `revealPreferenceErrors(): boolean` (show all errors, focus first invalid, true = invalid → stop Save), `redrawPreferencesEditor()` (call after a discard: it changes the draft, not the data, so the body is not redrawn by itself; also resets the "touched" state), `resetPreferenceErrorReveal()`. After a save, `applySavedUiPreferences(answer)` changes `data`, which redraws the body from the new draft.
- Errors show once a field of the row is committed (or after `revealPreferenceErrors()`); a fresh blank row is not flagged. Error TEXT is built at render time, so it re-translates.
- Also: `profile.preferences` and `/preferences` are the same stored dict (17a-1 note 3): after a successful save call `invalidateUiProfile()`.
