# Part 18c-1 — User intelligence B: Habits tab, form sections and validation (HANDOFF)

Builds on 3 (shared UI), 17a-1 (slices, diffForPartialPut), 17d (stringListEditor), 18a (uiHabits slice, tab entry, container id), 18b (the Energy form this one follows). The patch is relative to the 18b state. **No save logic, no new API call, nothing is sent.**

## Schema findings (read from the backend, not guessed)
Files: `schemas/user_intelligence.py` (`HabitProfileOut`), `api/routes/user_intelligence.py` (`UpdateHabitsRequest`, `GET/PUT /habits`), `services/user_intelligence.py` (`update_habit_profile`), `db/models.py` (`HabitProfile`).
- **GET** `HabitProfileOut { user_id, sleep, exercise, food, work, learning, leisure }`, each a plain `dict` (default `{}`). **PUT** `UpdateHabitsRequest`: the same six keys, each `dict | None`, applied with `exclude_unset`.
- **There is NO schema inside a category.** Not free text, not numbers, not enums, not nested objects, not lists: each category is an open JSON dict (stored as one JSON text column). No key names, no types, no ranges, no length limits, no validation anywhere.
- **Nothing in the backend reads a habit key.** The only writer is the dashboard check-in (`sleep: { quality, date }`, quality `poor | okay | good`); the only other hint is the docstring of `update_habit_profile` (`bedtime`, `wake_time` as examples). Habits are only recorded in the audit memory layer (`memory_layer.record(..., "habit", ...)`); the planner / behavioral memory do not consume them. The empty-state copy is therefore about the mentor REMEMBERING the routine, not about it changing plans.
- **Merge:** `dict.update()` per category (SHALLOW, although the docstring says deep). So a LIST value is replaced whole (shortening or emptying a list is saveable), a scalar key can NOT be removed, `null` inside a category is stored as a value, a category sent as `null` or non-dict is ignored, `{}` changes nothing. (Unchanged from 18a.)
- **Consequence:** the field list below is a **UI contract chosen in this part**, not a server one. Only `sleep.quality` (existing writer) and `sleep.bedtime` / `sleep.wake_time` (docstring) exist outside the UI. All limits are the UI's. Everything the form does not know is kept untouched (see "Unknown keys").

## Field list (`state/ui-habits.ts` `HABIT_FIELDS`, display order; the first field of a section is where "Add" moves focus)
| Category | key | input | rule |
|---|---|---|---|
| sleep | `bedtime` | time (`HH:MM`) | 00:00–23:59 |
| sleep | `wake_time` | time | same |
| sleep | `hours` | number, unit hours | 0–24, step 0.5 |
| sleep | `quality` | select | poor · okay · good (the check-in's values) |
| exercise | `days_per_week` | number, unit days | 0–7, whole |
| exercise | `minutes_per_session` | number, unit minutes | 0–600, whole |
| exercise | `type` | text | ≤ 100 chars |
| exercise | `preferred_time` | select | morning · afternoon · evening · varies |
| food | `meals_per_day` | number, unit meals | 0–10, whole |
| food | `caffeine_cups_per_day` | number, unit cups | 0–20, whole |
| food | `diet` | text | ≤ 100 |
| food | `restrictions` | list (EditableList) | ≤ 20 items, each ≤ 100, no repeats |
| work | `hours_per_day` | number, unit hours | 0–24, step 0.5 |
| work | `schedule` | select | fixed · flexible · shifts · mixed |
| work | `setting` | select | office · home · hybrid |
| work | `breaks_per_day` | number, unit breaks | 0–20, whole |
| learning | `minutes_per_day` | number, unit minutes | 0–720, whole |
| learning | `preferred_format` | select | reading · video · practice · discussion |
| learning | `topics` | list | as above |
| leisure | `hours_per_day` | number, unit hours | 0–24, step 0.5 |
| leisure | `screen_hours_per_day` | number, unit hours | 0–24, step 0.5 |
| leisure | `activities` | list | as above |

Change the list in one place (`HABIT_FIELDS`) plus its copy in `habitsForm.sections.<cat>.fields.<key>` (both languages). `smoke/ui-habits.test.ts` fails if a field, an enum value, a list label, a unit or an error key has no copy in en or fa.

## Behaviour
- **Draft:** all inputs read / write `uiHabits.draft` (a copy of `HabitProfileOut` made ONCE by the slice). A number is stored as a number, a cleared input removes the key, a list is stored as the whole array (blank rows stay in the draft while typing and are ignored by validation, like Goals). The tab body is not redrawn on a draft change, so focus stays. Language change redraws from the same draft: no refetch, no input lost (tested en to fa to en). The view never re-initializes the draft.
- **Unknown keys** (`date`, anything the chat stored): never dropped from the draft; listed read-only under "Other saved details" in their section.
- **Saved values the form can't show** (a number saved as text, `"11pm"` in a time field, a list saved as a string): the input stays empty, a "Saved earlier as …" note appears, the draft keeps the value, and it is NOT an error while it is exactly what the server holds. An enum value the form doesn't offer (`quality: "ok"`) stays selectable as "ok (saved earlier)".
- **Errors:** `validateUiHabitsDraft(draft, data?)` returns i18n KEYS; the view turns them into text at draw time, so a shown error re-translates on a language change. A field's error shows after the field was left (`blur` / `change`), or for all fields after `revealHabitsErrors()`. Each error sits in the field's own block, `aria-invalid` + `aria-describedby` (unit, hint, saved note, error; only what is visible). List errors sit under the row (both rows of a duplicate) or under the list (too many).
- **Empty state:** per section, `emptyStateGuide` (what it is for + "Add") above the inputs, shown while the section's DRAFT holds nothing meaningful (the 18a completeness rule); "Add" focuses the first input; the guide hides as soon as something is typed and returns if it is emptied. The tab's slice-level `isEmpty` is now `() => false` (like Energy / Goals): the generic chat guide never shows for Habits.
- **Save area:** `<div id="my-profile-habits-save" class="my-profile-form__slot" data-part="18c-2-save-area">` inside `#my-profile-habits-form`, empty (CSS hides an empty slot), marked with a comment block in `views/my-profile-habits.ts`. The container `#my-profile-habits-body` (18a) is unchanged.

## Decisions for you
1. **The field list is mine** (the schema is silent). If you want other keys, edit `HABIT_FIELDS` + copy. Time inputs and the "other saved details" block go slightly beyond the brief's four kinds (text / number / enum / list).
2. **`HABITS_CLEAR_IS_ERROR = true`:** emptying a field that holds a saved scalar is the error `cleared` ("can't be removed here yet"), because the API can't clear it (18a trap; same stance as the Energy level). If you accept `null` as "cleared" (nothing reads habits; the completeness rule already treats null as empty), set it to `false` and let 18c-2 send `null` for those keys. Lists are never `cleared`: emptying one saves as `[]`.
3. **UI limits** (100 chars, 20 items, ranges) are not server limits; loosen them freely.
4. **For 18c-2:** `diffForPartialPut(data, draft)` WITHOUT `nullable` sends each changed category WHOLE (including unknown keys, harmless with `dict.update`). Sending only the changed keys per category would be smaller and keeps the memory-layer record cleaner; your call. Before sending, trim text, drop blank list rows. Call `validateUiHabitsDraft(draft, data)` first and `revealHabitsErrors()` when invalid; after a discard call `redrawHabitsForm()`; after a success `applySavedUiHabits`.
5. `profile/habits` and `profile/energy` are still placeholder routes in the section registry (open since 17a-2 / 18a).

## Exported names
- `state/ui-habits.ts`: `HABIT_CATEGORIES`, `HABIT_FIELDS`, `HABITS_CLEAR_IS_ERROR`, `HABIT_ERROR_KEYS`, `HABIT_TEXT_MAX`, `HABIT_LIST_MAX_ITEMS`, `HABIT_LIST_ITEM_MAX`, `validateUiHabitsDraft(draft, original?) -> { valid, errors: { category, field, index|null, key }[] }` (keys: textTooLong, timeFormat, numberRange, numberStep, enumUnknown, listTooMany, listItemTooLong, listDuplicate, cleared), `habitCategoryOf`, `setHabitValue`, `habitFieldOf`, `otherHabitKeys`, `isHabitCategoryEmpty`, `matchesHabitField`, `isForeignHabitValue`, `isUnshowableHabitValue`, `hasHabitFieldValue`, `habitListItems`, `isHabitTime`, `isStepMultiple`, `habitFieldId`, `habitFieldErrors`; types `HabitCategory`, `HabitField`, `HabitUnit`, `HabitErrorKey`, `UiHabitsError`, `UiHabitsValidation`.
- `views/my-profile-habits.ts`: `renderHabitsTab(data)`, `redrawHabitsForm()`, `revealHabitsErrors()`, `resetHabitsErrorReveal()`, `describeValue`, ids `HABITS_FORM_ID`, `HABITS_SAVE_SLOT_ID`, `habitsSectionId(cat)`, `habitControlId(cat, key)`.
- DOM ids: `#my-profile-habits-form`, `-save`; per section `#my-profile-habits-<cat>` (+ `-title`, `-guide`, `-other`); per field `#my-profile-habits-<cat>-<key>` (+ `-hint`, `-error`, `-saved`, `-unit`; a list: `-group`, `-add`, `-<i>-text|remove|error`).
- i18n (fa + en, `fa` typed against `en`): `growth.myProfilePage.habitsForm` = `{ formLabel, intro, add, notSet, units, rangeHint, savedAs, enumSaved, other, list, errors, sections.<cat>{ title, intro, empty{ title, description, nextStep }, fields.<key>{ label, hint, options?, list? } } }`; `panels.habits.ready` reworded (no longer used by the tab).

## Verified
- `tsc --noEmit`: only the 10 errors already in the zip (the missing 17b files). Nothing new. `check:i18n` OK.
- 55 new tests pass (vitest + jsdom, real page, real slice tab, real store, only `fetch` stubbed): 27 pure (`smoke/ui-habits.test.ts`), 28 through the page (`smoke/my-profile-habits-view.test.ts`). `smoke/my-profile-tabs-18a.test.ts` edited for the Habits form (13 pass).
- I broke the code 11 ways (draft not written, step unchecked, guide never hidden, Add focusing nothing, errors shown before the field is left, untouched foreign value flagged, unknown keys dropped, duplicate flagging one row, cleared not detected, error text frozen in English, plus the no-op write): every one is caught.
- Full suite: 62 failures in the same 4 files as on the untouched zip (my-profile-form-view, my-profile-save-state, my-profile-save-view, plan-confirm-feedback); 1835 -> 1928 passing (the rest is 18b's tests + these 55).
- `patch --dry-run` of `existing-files-18c-1.patch` against the 18b zip: OK.

## Not verified
- How it looks (no browser here): six sections in a narrow column, the `<input type="time">` / number rows, the list editors, both themes, RTL, 375px. Screen-reader output.
- A half-typed time (`<input type=time>` reports "" until complete) briefly removes the key from the draft; if the field had a saved value you may see `cleared` until the time is complete.
- Persian copy is mine: skim `growth.myProfilePage.habitsForm` in `fa.ts`.

## Files
New (`frontend/…`): `src/state/ui-habits.ts`, `src/views/my-profile-habits.ts`, `smoke/ui-habits.test.ts`, `smoke/my-profile-habits-view.test.ts`.
Changed (also in `existing-files-18c-1.patch`): `src/views/my-profile-tabs.ts`, `src/growth-os/i18n/en.ts`, `src/growth-os/i18n/fa.ts`, `src/styles/my-profile.css`, `smoke/my-profile-tabs-18a.test.ts`.
Still missing from the zip (17b, unchanged): `state/ui-profile-form.ts`, `state/active-hours.ts`, `views/my-profile-active-hours.ts`.
