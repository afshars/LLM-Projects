# Part 18a — User intelligence B: slices, tab entries, completeness helper (HANDOFF)

No forms, no save logic, no new API call. Builds on 17a-1 (slices), 17a-2 (tab shell), 17d (the Goals tab; the patch is relative to the 17d state).

**Naming:** everything here is prefixed `ui`. **`uiDistractions` is `/user-intelligence/distractions` (the smart profile's distraction PROFILE, table `DistractionRecord`). It is NOT `/behavior/distractions` (the dated event log of Part 16c, `state/behavior-distractions*.ts`).** Different table, shape and page; nothing here calls or touches the behavior one. The Distractions tab intro says so to the user.

**Verified**
- `tsc --noEmit`: only the 10 errors already in the zip (the missing 17b files). Nothing new. `check:i18n` OK.
- 84 new tests pass (vitest + jsdom): 36 pure (`smoke/ui-section-completeness.test.ts`), 35 slices + dashboard (`smoke/user-intelligence-slices-18a.test.ts`), 13 through the real page (`smoke/my-profile-tabs-18a.test.ts`). I broke the code 12 ways (missing loader, list rejected as "not an object", default draft codec, no/over-eager dashboard invalidation, unloaded read as empty, reading log / preferences / `false` counted wrongly, tab ignoring the rule, invalidate not dropping an in-flight answer, slice missing from the reset list): every one is caught.
- Full suite: 62 failures in the same 4 files as on the untouched zip (my-profile-form-view, my-profile-save-state, my-profile-save-view, plan-confirm-feedback); 1751 -> 1835 passing.

**Not verified:** how the three new tabs look (no browser here: 6 tabs in the scrolling tab row, both themes, RTL, 375px); screen-reader output. Persian copy is mine: skim `growth.myProfilePage.tabs` and `.panels.{energy,habits,distractions}` in `fa.ts`.

**Still missing from the zip (17b, unchanged):** `state/ui-profile-form.ts`, `state/active-hours.ts`, `views/my-profile-active-hours.ts`. Also: `my-profile-tabs.ts` in this zip still has the 17a-2 placeholder for the Profile tab (the 17b wiring is not in it).

## Contract found in the backend (not guessed)
Files: `schemas/user_intelligence.py`, `api/routes/user_intelligence.py`, `services/user_intelligence.py`, `db/models.py`.
- **Energy** `GET -> EnergyProfileOut { user_id, energy_level: int|null, high_energy_hours: list[str], low_energy_hours: list[str], historical_energy_patterns: list[dict] }`. `PUT` body `UpdateEnergyRequest { energy_level?: int|null, high_energy_hours?: list[str]|null, low_energy_hours?: list[str]|null }`, applied with `exclude_unset`.
  - **TRAP, verified:** `high_energy_hours: null` / `low_energy_hours: null` is stored as the text `"null"`, and every later GET then fails response validation (HTTP 500). Clear a list with `[]`. Never send null for the hours.
  - **TRAP:** any `energy_level` key in a PUT also APPENDS a reading to `historical_energy_patterns` (with a null level if you send null), and records it in the memory layer. So send `energy_level` only when it really changed, and do not "clear" it. `historical_energy_patterns` and `user_id` are server-written: never part of a body.
  - No range check on `energy_level` anywhere (the model comment says "e.g. 1-10"; the app treats it as 1..10). Hours are free strings (comment: "HH:MM-HH:MM").
- **Habits** `GET -> HabitProfileOut { user_id, sleep, exercise, food, work, learning, leisure }`, each a free dict. `PUT` body `UpdateHabitsRequest`: each category `dict|null`. The service ignores a category that is not a dict (null included) and merges a dict with `dict.update()` (SHALLOW per category, although the docstring says deep). So a key the user removes from a category stays on the server, a null value inside a category is stored as a value, and `{}` changes nothing (same limits as Preferences, 17c-2).
- **Distractions `GET -> list[DistractionRecordOut { id, distraction_type, frequency|null, trigger|null, duration_minutes|null, context|null }]`, oldest first (`order_by created_at`). There is NO PUT, PATCH or DELETE: only `POST` (append one record; answer = that record).** So "all forms are partial PUTs" does not hold for this one: `diffForPartialPut` does not apply to it, a record can never be edited or removed, and the form of 18d is an "add a record" form. POST body: `distraction_type: str` required; `frequency`, `trigger`, `duration_minutes: int`, `context` optional; no enum, length or range limits.
- I added these three notes to the header of `state/diffForPartialPut.ts` (comment only, no code change): call it WITHOUT `nullable` for energy and habits.

## Slices (`state/user-intelligence.ts`, `state/user-intelligence-flow.ts`)
Same shape as 17a-1: `{ data, draft, status: "idle"|"loading"|"success"|"error", error: ApiError|null }` (read `error.kind`).

| Slice | `data` | `draft` | GET (apiClient) |
|---|---|---|---|
| `uiEnergy` | `EnergyProfileOut` | copy of data | `getEnergyProfile()` |
| `uiHabits` | `HabitProfileOut` | copy of data | `getHabitProfile()` |
| `uiDistractions` | `UiDistractionRecords` (= `DistractionRecordOut[]`, a LIST) | **the next record to add** (`UiDistractionEntryDraft`, all fields as typed text), blank at start | `listUserDistractions()` |

- `UiSliceName` and `UI_SLICE_NAMES` now hold all six; `UiState` has the three new keys; `reset()` (login step) idles all six (the store builds its initial state from one `idleState()`).
- **Load rules unchanged:** a slice loads only when `idle` (first visit); revisits, rebuilds and language changes never refetch; an error stays an error until Refresh / Try again; refresh keeps unsaved edits (draft follows only if untouched); a failed refresh keeps data and draft; an answer for an invalidated generation is dropped.
- **Shape check:** `run()` takes an `isShapeOk` (default: a plain object). `uiDistractions` accepts only a LIST of objects (an empty list is a valid answer); anything else is an `unknown` error and is never stored. Energy / habits reject a list or scalar.
- **Distractions draft:** `DISTRACTIONS_DRAFT_CODEC` (`state/ui-distractions.ts`): `toDraft` = a blank entry whatever the records are; `isUntouched` = all fields `""`. So a refresh never overwrites a half-typed entry and a language change keeps it.

**Names**
- Slice names: `uiEnergy`, `uiHabits`, `uiDistractions`.
- Invalidate: `invalidateUiEnergy()`, `invalidateUiHabits()`, `invalidateUiDistractions()`.
- Ensure (first visit): `ensureUiEnergyLoaded()`, `ensureUiHabitsLoaded()`, `ensureUiDistractionsLoaded()`.
- Refresh (explicit): `refreshUiEnergy()`, `refreshUiHabits()`, `refreshUiDistractions()`. All resolve `"ok" | "failed" | "skipped"` and never reject.
- Draft helpers: `setUiEnergyDraft(d)`, `setUiHabitsDraft(d)`, `setUiDistractionsDraft(entry)`; `applySavedUiEnergy(a)`, `applySavedUiHabits(a)`; `resetUiEnergyDraft()`, `resetUiHabitsDraft()`, `resetUiDistractionsDraft()` (entry back to blank, records kept).
- **`applyAddedUiDistraction(record)`** (distractions only): after a successful POST, appends the record to `data` (ignored if its id is already there or if there is no data yet) and blanks the entry draft. It blanks the draft even if the user began a second entry while the POST ran: 18d should compare with the sent entry first if it wants to keep that.
- `state/ui-distractions.ts`: `UiDistractionRecords`, `UiDistractionEntryDraft`, `blankUiDistractionEntry()`, `isBlankUiDistractionEntry()`, `DISTRACTIONS_DRAFT_CODEC`.

## Tab entries (`views/my-profile-tabs.ts`)
Appended to `MY_PROFILE_TABS` after `goals`, same declarative shape (`{ id, labelKey, containerId, render }`), each `mountSliceTab` (loads on first open only, AsyncPanel skeleton / error + Try again / empty guide / placeholder). `LOADERS` in `views/my-profile-slice-tab.ts` has the three new slices.

| Tab `id` / `labelKey` | Container id | Slice | Placeholder |
|---|---|---|---|
| `energy` | `my-profile-energy-body` | `uiEnergy` | `.my-profile__ready` text, or the empty guide |
| `habits` | `my-profile-habits-body` | `uiHabits` | same |
| `distractions` | `my-profile-distractions-body` | `uiDistractions` | same |

Tab / panel DOM ids follow the shell: `#my-profile-tab-<id>`, `#my-profile-panel-<id>`. 18b-18d replace `renderReady` (like 17c/17d: set `isEmpty` to `() => false` once the form shows its own empty state). The placeholders' `isEmpty` uses `isUiSectionEmpty` (below), so the tab and the helper cannot disagree.
i18n (fa + en, `fa` typed against `en`): `growth.myProfilePage.tabs.{energy,habits,distractions}` (Energy / Habits / Distractions; انرژی / عادت‌ها / حواس‌پرتی‌ها) and `growth.myProfilePage.panels.{energy,habits,distractions}` = `{ label, intro, empty: { title, nextStep }, ready }`. The `ready` lines are placeholder wording ("Editing them arrives in the next update"): 18b-18d reword them.

## Completeness helper (`state/ui-section-completeness.ts`)
```ts
getUiSectionCompleteness(slices: UiSectionSlices): UiSectionCompleteness
// UiSectionSlices = { uiProfile|uiPreferences|uiGoals|uiEnergy|uiHabits|uiDistractions: { data: <its data type> | null } }
// -> userIntelligenceStore.get() fits as is.
// UiSectionCompleteness = Readonly<Record<"profile"|"preferences"|"goals"|"energy"|"habits"|"distractions", "empty"|"filled"|"unknown">>
```
Also exported: `UI_SECTION_KEYS`, types `UiSectionKey`, `UiSectionState`, `UiSectionData`, `UiSectionSlices`, `isUiSectionEmpty(key, data)` (the rule on loaded data), `hasMeaningfulValue(value)`, `HABIT_CATEGORIES`. Pure; reads only `.data` (never the draft: an unsaved edit does not make a section filled); modifies nothing.

**`"unknown"`** (a third value, beyond empty / filled): the slice has no data yet (never loaded, loading for the first time, or the first load failed). Calling it "empty" would make a caller nag users who did fill it in. A slice that already has data stays known while refreshing or after a failed refresh.

**Rules** (my choices where the schema is silent; `user_id` never counts). A "meaningful value": text that is not blank; a finite number (0 included); a boolean (`false` included); null / undefined never; an array or object only if something inside is, recursively (`[]`, `{}`, `{a:null}`, `{a:""}` are not).
- **profile**: filled if any of name / occupation / lifestyle / communication_style / motivation_style / planning_style is non-blank text; or a focus / break duration is a number **> 0**; or `active_hours` has a non-blank item. **`preferences` is NOT counted** (same dict as the Preferences section; the Profile form does not edit it). The 17a-2 placeholder of the Profile tab did count it; that placeholder is replaced by the 17b form.
- **preferences**: filled if any value is meaningful (a stored null / "" / [] / {} does not count; `false` and `0` do).
- **goals**: filled if any of the four lists has a non-blank item, or `current_focus_goal` is non-blank (the server answers `""` after a clear = empty).
- **energy**: filled if `energy_level` is a number **> 0**, or high / low hours has a non-blank item. **`historical_energy_patterns` is NOT counted**: it is a server-written log that keeps past readings (also null ones) after the user clears the level.
- **habits**: filled if any of the six categories holds a meaningful value, recursively (`{ exercise: { days: 0 } }` is filled; `{ sleep: {}, food: { x: null } }` is empty). What the dashboard check-in writes (`sleep: { quality, date }`) fills it.
- **distractions**: filled if at least one record has a non-blank `distraction_type` (the only required field). Empty list = empty.

**Decisions for you**
1. Numbers: profile durations and `energy_level` need `> 0` (0 minutes / level 0 is not something anyone told the mentor), while preferences and habits count any finite number (a free-form "0 workouts" is an answer). If you want one rule for all, change `isPositive` / `hasMeaningfulValue`.
2. `unknown` as a third state. If a caller wants a strict boolean, treat `unknown` as "don't show a nudge".
3. Profile excludes `preferences`; energy excludes its log (see above).

## Extra change outside the brief (one small, tested wire)
`state/dashboard.ts` `saveCheckIn`: the daily check-in already wrote `energy_level` and `sleep` via `updateEnergyLevel` / `updateSleepHabit`. After each write that SUCCEEDED it now calls `invalidateUiEnergy()` / `invalidateUiHabits()` (same pattern as the existing `invalidateDailyPlan`), so a loaded Energy / Habits slice is not stale. An idle slice stays idle (nothing is fetched); a failed write invalidates nothing. Tested in `user-intelligence-slices-18a.test.ts`. Revert those 3 lines if you would rather wire it in 18b/18c.
Nothing calls `invalidateUiGoals()` yet (the chat part should, after it writes goals: see HANDOFF 17d).

## Open items for 18b-18d
- `profile/energy` and `profile/habits` are still placeholder routes in the section registry (17a-2 note): decide whether they redirect into these tabs or are removed.
- 18b (Energy): body from `diffForPartialPut(data, draft)` WITHOUT `nullable`, exclude `user_id` and `historical_energy_patterns`; never null hours (use `[]`); beware that sending `energy_level` appends to the log.
- 18c (Habits): body per category, removal impossible, null stored as value (see above).
- 18d (Distractions): POST only; use `applyAddedUiDistraction`.

## Files
New (`frontend/…`): `src/state/ui-distractions.ts`, `src/state/ui-section-completeness.ts`, `smoke/ui-section-completeness.test.ts`, `smoke/user-intelligence-slices-18a.test.ts`, `smoke/my-profile-tabs-18a.test.ts`.
Changed (also in `existing-files-18a.patch`, relative to the 17d state; verified with `patch --dry-run`): `src/state/user-intelligence.ts`, `src/state/user-intelligence-flow.ts`, `src/state/dashboard.ts`, `src/state/diffForPartialPut.ts` (comment only), `src/views/my-profile-slice-tab.ts`, `src/views/my-profile-tabs.ts`, `src/growth-os/i18n/en.ts`, `src/growth-os/i18n/fa.ts`.
