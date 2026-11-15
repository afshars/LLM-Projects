# Part 17b-2 — Profile tab: active_hours editor (HANDOFF)
No save (17b-3). Contract read from `schemas/user_intelligence.py`, `routes/user_intelligence.py` (`UpdateProfileRequest`), `services/priority_engine.py` (`get_available_time`, `_parse_range`, `_parse_hhmm`), `routes/daily_plan.py`, `schemas/busy_block.py` (not guessed).

## Exact shape of `active_hours`
**One flat `list[str]`; each entry one string `"HH:MM-HH:MM"` (24-hour clock).** Not per-day, not numbers, not objects. `[]` is the default and is valid data. PUT `/user-intelligence/profile` with `active_hours` **replaces the whole list** (other fields untouched). Order is irrelevant to the server (it sorts).

**The server does NOT validate it.** `UpdateProfileRequest.active_hours` is a bare `list[str] | None`: a malformed string is stored and then `_parse_range` raises `ValueError` inside the daily plan. **Overlap is not rejected anywhere either**, and `get_available_time` walks each window on its own, so overlapping windows count the shared time twice and overstate capacity. The client is the only guard, so the rules below are errors here.
Empty list: accepted by the PUT, but `GET /daily-plan` answers 400 until at least one range exists, hence the empty-state copy.

## Rules (`validateActiveHours`)
Each time `HH:MM`, hour 00-23, minute 00-59 · end strictly after start · no overlap (touching is allowed) · empty list valid · no cap on the number of ranges (the schema has none). Stricter of the two server parsers is used (the busy-block regex), not `_parse_range`'s looser one.

## Ambiguities (conservative choice taken)
1. **`24:00`**: `_parse_range` accepts it (1440), the busy-block regex rejects it, a time input cannot pick it, and `_fmt` would print the slot label as `00:00`. Treated as **unreadable**, so a range cannot end at midnight; latest end is `23:59`.
2. **Touching ranges** (`09:00-12:00`, `12:00-14:00`): allowed (no shared time), but the planner builds two separate slots, so one long task cannot span the join. Not merged silently.
3. **Unpadded / spaced strings** (`"9:00 - 17:00"`): the server's parser tolerates them, so the editor reads them, and `activeHoursForSave` rewrites them as `09:00-17:00`.
4. **Unreadable stored strings** (e.g. `"9am-5pm"`, written by something else): shown as a row with its raw text (`Saved as “…”`) and an `unreadable` error; kept byte-for-byte in the draft until the user edits that row. Removing it is allowed.

## New / changed
**New:** `state/active-hours.ts`, `views/my-profile-active-hours.ts`, `smoke/my-profile-active-hours-state.test.ts` (27), `smoke/my-profile-active-hours-view.test.ts` (26). **Changed:** `views/my-profile-profile-form.ts` (fills the slot; `revealProfileFormErrors` now covers the editor), `styles/my-profile.css`, `growth-os/i18n/en.ts`+`fa.ts` (`myProfilePage.profileForm.activeHours`), `smoke/my-profile-form-view.test.ts` (the "slot is empty" test now expects the active-hours slot filled, save slot still empty). Existing-file diffs: `existing-files-17b-2.patch`.

## Converters and functions (`state/active-hours.ts`, all pure)
- UI model: `ActiveHoursRow = { start: "HH:MM"|"", end: "HH:MM"|"", raw: string|null }`.
- **`activeHoursToRows(value)`** backend/draft list -> rows (never throws) · **`rowsToActiveHours(rows)`** rows -> *draft* list · `rowFromString(entry)`.
- **`activeHoursForSave(value): string[] | null`** the ONLY thing to PUT: zero-padded, sorted by start; `null` when invalid (stop and reveal errors); `[]` when empty.
- **`validateActiveHours(value) -> { valid, errors }`**: `errors[i]` (same order as the list) is `null` or `{ key, field: "start"|"end"|"both", overlapsWith: number|null }`. `key` ∈ `unreadable | bothRequired | startRequired | endRequired | endNotAfterStart | overlap` (keys of `…profileForm.activeHours.errors`; `overlap` is a function taking the 1-based range number as formatted text). Overlap marks both ranges.
- Edits: `addActiveHoursRow`, `removeActiveHoursRow(value, i)`, `setActiveHoursTime(value, i, "start"|"end", time)`. Time helpers: `parseTime`, `formatTime`, `normalizeTime`.

## Draft encoding (important for 17b-3)
Edits go to `uiProfile.draft.active_hours` (a plain `string[]`), so they survive a language change and `resetUiProfileDraft` / `applySavedUiProfile` just work. An unfinished range is a **partial string** (`"09:00-"`, `"-12:00"`, `"-"`). **So the draft is not always backend-safe: never PUT `draft.active_hours` raw.** 17b-3: `valid = validateUiProfileDraft(draft).valid && validateActiveHours(draft.active_hours).valid`; call `revealProfileFormErrors()` first (now covers fields AND ranges, focuses the first invalid one, fields come first on screen; true = stop); then send `active_hours: activeHoursForSave(draft.active_hours)`. Dirty check with `diffForPartialPut` compares the raw lists (a list that only differs by order or padding counts as changed; harmless).

## Editor (`views/my-profile-active-hours.ts`)
Exports `renderActiveHoursEditor(data)`, `revealActiveHoursErrors(focus = true): boolean`, `activeHoursInputId(i, field)`, `ACTIVE_HOURS_EDITOR_ID`. Drawn inside `#my-profile-profile-active-hours` as a `<fieldset>` + legend + intro. Per range (N = 1-based): `…-active-hours-range-N-start|end` (`<input type="time">`, `dir=ltr`), `…-range-N-error`, `…-range-N-remove`; `…-active-hours-add`.
- **A11y:** label for each time = visible "Start time"/"End time" + sr-only full name **"Range 2: start time"** (contains the visible text); Remove button visible "Remove", `aria-label` **"Remove range 2"**; list has `aria-label`; per-range error is `aria-live=polite`, `aria-invalid` only on the input(s) the error belongs to, `aria-describedby` only while an error shows; a `role=status` region announces "Range 2 added/removed". Numbers go through `Intl.NumberFormat(locale)` (Persian digits in fa).
- **Focus:** Add -> new range's start; Remove -> the Remove button now in that slot, else the previous one, else the empty state's button; reveal -> the input the error belongs to.
- **Errors:** shown on `change` (commit), cleared while editing that range, re-shown (translated) when the editor is redrawn. A blank new range stays quiet until Save is pressed (no error the moment Add is clicked); after a reveal it keeps its error.
- **Empty state** (`emptyStateGuide`): "Active hours decide when tasks can be scheduled. Until you set some, the mentor can't build your daily plan." + "Add at least one range…" + "Add a range" button.
- Add/Remove redraw only the editor body (the tab body is not redrawn for a draft change), so nothing else loses focus.

## Verified (all run for real; `npm ci` worked this time)
`tsc --noEmit` strict: clean (no more `main.ts` side-effect failures) · `vite build` OK · `check:i18n` OK (en = fa, placeholder/type parity) · **53 new tests pass** (state 27 incl. every parser edge above; view 26 in jsdom: accessible names, draft writes, add/remove focus, empty state, errors, language switch en -> fa, reset, `revealProfileFormErrors`) · the 17b-1 tests pass too, so they now run (17b-1 could not run them). A real bug found by the tests and fixed: reveal focused the start input even when the end was the missing one.
**Pre-existing, not mine:** `smoke/plan-confirm-feedback.test.ts` (Part 13) has 17 failing tests on the untouched 17b-1 zip too (the error element is empty). Everything else: 1683 pass.
**Not verified:** how it looks (both themes, RTL, 360px); real browsers' `<input type="time">` (en-US shows 12-hour AM/PM, so the copy never says "24-hour"; a half-typed time in the picker is "" until complete, so on a language rebuild that half-typed side is lost). Persian copy is mine: skim `profileForm.activeHours` in `fa.ts`.
**Suggested backend follow-up (out of scope, not done):** a validator on `UpdateProfileRequest.active_hours` (same regex, end > start, no overlap), since today any string list is stored.
