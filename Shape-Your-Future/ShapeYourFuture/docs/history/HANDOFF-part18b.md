# Part 18b — User intelligence B: Energy tab (HANDOFF)

Builds on 3 (shared UI), 9a (invalidateDailyPlan), 17a-1 (slices, diffForPartialPut), 18a (uiEnergy slice, tab entry). The patch is relative to the 18a state.

## Schema findings (read from backend code, not guessed)
Files: `schemas/user_intelligence.py`, `api/routes/user_intelligence.py`, `services/user_intelligence.py`, `db/models.py`, `services/priority_engine.py`, `orchestrator/daily_flow.py`, `services/conversation_manager.py`.
- **Level:** `energy_level: int | null`. No server range check; the app treats it as 1..10.
- **Hours:** `high_energy_hours` / `low_energy_hours`: `list[str]`, free strings on the wire. The planner (`priority_engine._parse_range`) parses each as `"HH:MM-HH:MM"` and RAISES when end <= start. The form therefore writes zero-padded `HH:MM-HH:MM` with end after start. The chat (`conversation_manager`) can store free text there (e.g. `["morning"]`): shown as a read-only "raw" row with Remove, tolerated by validation when it is already on the server.
- **History:** `historical_energy_patterns` is READ-ONLY, server-written. Any `energy_level` key in a PUT APPENDS `{ recorded_at: ISO UTC datetime, energy_level }` (a null level appends a null reading). Returned OLDEST FIRST; the UI reverses it. The model comment `{date, hour, level}` is stale; the reader falls back to `date` / `level`.
- **Null hours** are stored as the text `"null"` and break every later GET (500, see HANDOFF 18a). Never sent: an emptied list is `[]`.
- **Partial PUT:** `diffForPartialPut` WITHOUT `nullable`; only the 3 editable keys take part (`user_id` and history never reach the body). `energy_level` is sent only when changed (each send adds a reading); the UI hint says so.

## Behaviour
- Level: number input 1..10 with a label, hint, and an `<output>` read-out ("7 of 10", announced as it changes). Number input rather than slider because "not set" is a real state.
- Hours: one row per range with two `<input type="time">`, Add / Remove, status line for screen readers. Overlap between the two lists is an error on both rows (touching edges are fine).
- Clearing a level that is set = validation error `levelClear` (the API cannot clear it without a null reading).
- History: newest first, date + level, null-safe, capped at 20 (count of older ones shown), inline SVG trend (no chart lib), read-only.
- Save: disabled when `changed` false, invalid, or submitting (submitLock). Success: slice updated, draft reset, `role="status"` (+ "A reading was added" line when `energy_level` was sent). Errors via `errorMessage(err, "save")` in `role="alert"` (validation, 429 "wait a moment", 500, network); draft stays; Try again; Discard changes. Typing while a save runs is kept.
- `invalidateDailyPlan()` after a successful save whose body held an hours list (the plan reads the hours, not the level). One-line comment in `ui-energy-save-flow.ts`.
- Language change: rebuild from the same draft, no refetch. i18n `growth.myProfilePage.energyForm` (fa + en); `panels.energy.ready` reworded.
- The Energy tab's slice-level `isEmpty` is now `() => false` (the form has its own empty states). `isUiSectionEmpty("energy")` is unchanged for other callers.

## Exported names
- `state/ui-energy.ts`: `validateUiEnergyDraft(draft, original?) -> { valid, errors: { field, index, key }[] }` (keys: levelRange, levelClear, hoursIncomplete, hoursFormat, hoursOrder, hoursDuplicate, hoursOverlap), `computeEnergyPut(data, draft) -> { changed, dirty, body, addsReading, changesHours }`, `readEnergyHistory`, `newestEnergyHistory`, `energyTrendLevels`, `parseClock`, `padClock`, `parseHoursRange`, `hoursStringToRow`, `hoursRowToString`, `ENERGY_LEVEL_MIN/MAX`, `ENERGY_HISTORY_SHOWN`, `ENERGY_HOURS_KEYS`.
- `state/ui-energy-save.ts`: feedback store (`getUiEnergyFeedback`, `setUiEnergySaved/Discarded/SaveError`, `clearUiEnergyFeedback`, `takeFreshUiEnergyFeedback`).
- `state/ui-energy-save-flow.ts`: `sendUiEnergySave()`, `discardUiEnergyEdits()`, `canSaveEnergy()`.
- `views/my-profile-energy.ts`: `renderEnergyTab`, `redrawEnergyForm`, `revealEnergyErrors`, `resetEnergyErrorReveal`, ids `ENERGY_FORM_ID`, `ENERGY_LEVEL_ID`, `ENERGY_SAVE_SLOT_ID`, `ENERGY_HISTORY_ID`, `energyHoursId(kind)`.
- `views/my-profile-energy-save.ts`: `renderEnergySaveArea`, `energySaveId(part)`, `ENERGY_SAVE_LOCK_KEY`.

## Verified
- `tsc --noEmit`: no new errors (still the 15 in main.ts from missing node_modules and the 10 from the missing 17b files). `check-i18n-parity` OK (1519 / 1519).
- `smoke/ui-energy.test.ts` (22 pure tests) pass, run with a throwaway vitest stand-in.
- Real view bundled with esbuild and run in Chromium at 375px with stubbed fetch: 35 checks pass (level-only and hours-only PUT bodies, plan invalidation, overlap, discard, 422/429/500/network with draft kept, language change to fa with no refetch, no horizontal scroll en + fa). Mutation checks (no plan invalidation; energy_level always sent) each failed the run. Screenshots reviewed (en, fa RTL).
- `patch --dry-run` of `existing-files-18b.patch` against the 18a zip: OK.

## Not verified
- `smoke/my-profile-energy-view.test.ts` (jsdom) was written but NOT run (no vitest/jsdom here); same scenarios passed in Chromium. `smoke/my-profile-tabs-18a.test.ts` was edited for the Energy placeholder but also not run. Run `npx vitest run` once.
- No real backend, no screen reader, no dark/light visual pass beyond the dark screenshots. Persian copy is mine: skim `energyForm` in `fa.ts`.
- `panels.habits.ready` is still the 18a placeholder (18c).

## Files
New (`frontend/…`): `src/state/ui-energy.ts`, `ui-energy-save.ts`, `ui-energy-save-flow.ts`, `src/views/my-profile-energy.ts`, `my-profile-energy-save.ts`, `smoke/ui-energy.test.ts`, `smoke/my-profile-energy-view.test.ts`.
Changed (also in `existing-files-18b.patch`): `src/views/my-profile-tabs.ts`, `src/growth-os/i18n/en.ts`, `src/growth-os/i18n/fa.ts`, `src/styles/my-profile.css`, `smoke/my-profile-tabs-18a.test.ts`.
