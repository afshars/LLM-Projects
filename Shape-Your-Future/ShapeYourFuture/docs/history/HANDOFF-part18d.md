# Part 18d — User intelligence B: Distractions tab and the "what is still empty" overview (HANDOFF)

Builds on 3 (shared UI), 17a-1/17a-2 (slices, page shell), 18a (uiDistractions slice, completeness), 18c-2a/2b (the Habits save flow and `ui-save-core.ts`). Applied on `project-ui2-part18c-2b.zip`.

## Schema findings (read from the backend, not guessed)
Files: `backend/app/schemas/user_intelligence.py` (`DistractionRecordOut`), `backend/app/api/routes/user_intelligence.py` (`RecordDistractionRequest`, `GET` / `POST /distractions`), `frontend/src/api/client.ts` (`listUserDistractions`, `recordUserDistraction`), `api/types.ts`.
- **GET** `/user-intelligence/distractions` answers a **list of objects** (`list[DistractionRecordOut]`): `{ id: int, distraction_type: str, frequency: str|null, trigger: str|null, duration_minutes: int|null, context: str|null }`, oldest first. Not a list of strings, not free text.
- **There is NO PUT, NO PATCH and NO DELETE.** The only write is **POST** (`RecordDistractionRequest`: `distraction_type: str` required; `frequency`, `trigger`, `duration_minutes: int`, `context` optional) and it **appends one record** and answers it. A saved record can never be edited or removed. No enum, no length limit, no range check on the server: every limit in the form is the UI's.
- **So the brief's "partial PUT / `diffForPartialPut` / `changed`" does not apply** (there is no PUT client method either; only `recordUserDistraction`). What replaces it: the draft is the NEXT record (18a); "something to save" = `canAddUiDistraction(draft)` (the entry has content and validates); the body is built by `buildUiDistractionBody` (trimmed, blank optional fields left out, never `null`, minutes as an integer).
- **`EditableList` does not exist by that name** (my one search found no hit). The 17d-1 component is `stringListEditor` (a list of strings). It does not fit: a record is an object with five fields. So the form is five plain fields (type, frequency, trigger, minutes, context) + a read-only list of the saved records (newest first).
- `HANDOFF-part4.md` is not in the zip. The Chat page comes from the registry (`findSection("chat").entry`, today `{ step: "CHAT" }`), through `journey.goTo` / `goToRoute`; nothing is hard-coded in the overview.

## What changed
Shared helper `state/ui-save-core.ts` (reused, not duplicated): `uiDistractions` joined `CopyDraftSliceName`, and `commitUiSave(snapshot, answer, beforeApply?, codec?)` takes an optional draft codec (the distractions draft is a blank entry, not a copy of the list). Nothing else about it changed; Habits/Energy/Goals/Profile calls are unaffected.

New (`frontend/src/…`):
- `state/ui-distractions-save.ts`, `state/ui-distractions-save-flow.ts`, `state/my-profile-overview.ts`
- `views/my-profile-distractions.ts`, `views/my-profile-distractions-save.ts`, `views/my-profile-overview.ts`
- tests (`frontend/smoke/`): `ui-distractions.test.ts` (21), `my-profile-overview.test.ts` (6)

Changed: `state/ui-save-core.ts`, `state/ui-distractions.ts` (+ validation / body builders), `views/my-profile-tabs.ts` (Distractions entry; unused import removed), `views/my-profile.ts` (overview above the tabs, `openTab`, panels focusable), `growth-os/i18n/en.ts` + `fa.ts`, `styles/my-profile.css` (appended).

## Exported names
- `state/ui-distractions.ts` (new part): `DISTRACTION_LIMITS` (type 100, frequency 100, trigger 200, context 500, minutes 1–1440), `UI_DISTRACTION_FIELDS`, `DISTRACTION_ERROR_KEYS`, `validateUiDistractionsDraft(draft)` -> `{ valid, errors: { field, key }[] }` (keys: typeRequired, typeTooLong, frequencyTooLong, triggerTooLong, contextTooLong, durationNotNumber, durationWhole, durationRange), `uiDistractionFieldError`, `hasUiDistractionContent`, `parseDistractionMinutes`, `canAddUiDistraction`, `buildUiDistractionBody`, `setUiDistractionField`; types `UiDistractionField`, `DistractionErrorKey`, `UiDistractionsError`, `UiDistractionsValidation`. (Existing from 18a: `UiDistractionEntryDraft`, `blankUiDistractionEntry`, `isBlankUiDistractionEntry`, `DISTRACTIONS_DRAFT_CODEC`.)
- `state/ui-distractions-save.ts`: `uiDistractionsFeedback`. `state/ui-distractions-save-flow.ts`: `sendUiDistractionSave()`, `discardUiDistractionEntry()`, `canSaveDistraction()`.
- `state/my-profile-overview.ts` (pure): `overviewRows`, `overviewSummary`, `showOverviewChatHint`, `overviewKey`; types `OverviewRow`, `OverviewSummary`.
- `views/my-profile-distractions.ts`: `renderDistractionsTab(records)`, `redrawDistractionsForm`, `revealDistractionsErrors`, `resetDistractionsErrorReveal`, `distractionControlId(field)`, `DISTRACTIONS_FORM_ID`, `DISTRACTIONS_SAVE_SLOT_ID`, `DISTRACTIONS_GUIDE_ID`, `DISTRACTIONS_LIST_ID`.
- `views/my-profile-distractions-save.ts`: `renderDistractionsSaveArea`, `distractionsSaveId(part)`, `DISTRACTIONS_SAVE_LOCK_KEY`.
- `views/my-profile-overview.ts`: `renderMyProfileOverview({ tabs, openTab })` -> `{ node, dispose }`, `openChatFromRegistry()`, `MY_PROFILE_OVERVIEW_ID`, `MY_PROFILE_OVERVIEW_LIST_ID`, `MY_PROFILE_OVERVIEW_CHAT_ID`, `overviewItemId(key)`.
- i18n (fa typed against en): `growth.myProfilePage.distractionsForm` = `{ formLabel, intro, add, empty{title, description, nextStep}, unitMinutes, fields.<field>{label, hint}, errors, list, save }` and `growth.myProfilePage.overview` = `{ title, listLabel, summary(filled,total), states{filled,empty,unknown}, fill, open, fillLabel(section), openLabel(section), chatHint, chatLink }`. Reworded: `panels.distractions.intro` (now the one-sentence hint: "This tab describes what usually distracts you in general, while the Reflect section logs individual events.") and `panels.distractions.ready` (no longer shown).

## DOM ids
**The overview container is `#my-profile-overview`** (a `<section>`; above the tablist, inside `#my-profile-view`). Inside it: `#my-profile-overview-title`, `-summary` (polite live region), **`#my-profile-overview-list`** (`<ul role="list">`), one `<li id="my-profile-overview-<profile|preferences|goals|energy|habits|distractions>" data-overview-state="filled|empty|unknown">`, buttons `[data-overview-action="<section>"]`, `#my-profile-overview-chat` (+ `-link`).
Distractions: tab container `#my-profile-distractions-body` (18a), `#my-profile-distractions-form`, `-save` (slot) with `-save-button | -discard | -retry | -problems | -hint | -status | -error | -wait`, `-guide`, `-list`, fields `#my-profile-distractions-<type|frequency|trigger|duration|context>` (+ `-hint`, `-error`, `-unit`).

## Behaviour
- **Distractions form:** five inputs write the draft (text as typed); the body is not redrawn on typing (focus stays). Errors are keys, shown after a field is left or after "Show what needs fixing", text looked up at draw time. Save is disabled while there is nothing to add, while invalid, or while a request runs (`submitLock`, 429 -> "please wait"). Success: `role="status"` "Distraction saved.", the record is appended to the list, the entry blanks. Failure: `errorMessage(err, "save")` in `role="alert"`, a 422 adds a short summary, "Try again" (not for a 401), **the entry stays**. An entry typed while a request runs is kept. No other store is invalidated.
- **Discard changes** (`#my-profile-distractions-save-discard`): shown only while the entry holds something; blanks it, clears field errors and the error box, shows "Changes discarded.", sends **no** request; the saved records are untouched.
- **Overview:** from `getUiSectionCompleteness(userIntelligenceStore.get())`: one row per section that has a tab, in words (Filled / Empty / Not checked yet) + a decorative mark; a button on every row that is not filled ("Fill in" on empty, "Open" on not-checked) that switches tab and moves focus to its panel (`tabindex="-1"`, not in the Tab order). It reads `data` only (never a draft), repaints only when what it shows changes (typing never repaints it), and follows a save with **no request** (a save writes `data`, the store emits, the overview repaints).
- **Chat hint** "You can fill these in by chatting" + an "Open chat" button: shown while at least one section is KNOWN to be empty; hidden when none is (all filled, or only not-checked-yet).
- **Language change:** the page rebuild re-draws everything from state: no request, drafts kept, errors/messages re-translated (verified in a browser, below).

## Decisions for you
1. **"Not checked yet".** Only the open tab loads its slice (17a-2, tested: unopened tabs send no request), so on a first visit five rows say "Not checked yet" with an "Open" button, and say "Empty" only for sections whose data is loaded. I did not make the page load all six: that would break the "unopened tabs send no request" rule (and its tests). If you want the overview complete at once, call the six `ensureUi…Loaded()` (each is a no-op unless idle) once when the overview mounts, and update those tests.
2. **Save-area rules for an append-only slice.** The brief's "disabled when `changed === false`" became "disabled when there is nothing valid to add" and "Discard only when changed" became "only while the entry holds something" (the Habits button uses `dirty` for the same reason: an invalid-but-unsendable entry still needs a way back).
3. **Duplicate risk:** POST is not idempotent and there is no DELETE. After a network error the record may already exist, and "Try again" can add it twice (visible in the list, not removable). Same stance as the other append-only calls.
4. **Limits are the UI's** (100 / 100 / 200 / 500 chars; minutes 1–1440). Change them in `DISTRACTION_LIMITS`.
5. **The Chat "link" is a button** (`btn-ghost`): app navigation here is `journey.goTo`, not a URL. Same for the overview's tab buttons.
6. **"Reflect section"** is the nav label of the section that contains the Behavior page (Persian: "بازنگری"). The tab hint names it; the old intro said "Behavior page".
7. `styles/my-profile.css`: I **appended** a block (overview, distractions) with logical properties and `currentColor`; I did not open the file, so it uses literal rem values instead of your tokens. Swap them for tokens if you prefer.

## Verified
- `tsc --strict --noUnusedLocals` on all of `src/`: the same 12 errors as on the 18c-2b zip (the missing 17b files and `main.ts` CSS imports), none new.
- `check:i18n` (the real script, run on tsc output): **OK, en 1735 / fa 1735** (+57 keys), no empty values, no placeholder mismatch.
- 27 tests (`ui-distractions.test.ts` 21, `my-profile-overview.test.ts` 6) pass, run through a throwaway vitest stand-in (no vitest here), real store, only `fetch` stubbed. I broke the code twice on purpose (no draft codec; no invalidation check) and the tests caught both.
- **Real browser (headless Chromium, the real page bundled with esbuild, stub backend): 44 checks pass**: overview list/ARIA/states in words, unknown never called empty, "Open"/"Fill in" switch the tab and put the focus on the panel, hint shown/hidden, the one-sentence tab hint, empty guide "Add" focuses the first input, Save/Discard enablement, errors after blur, a language change (fa and back) with zero requests, draft kept and a shown error re-translated, Discard (no request, errors gone, role=status), one POST with the trimmed body and no refetch, overview flips to Filled with no GET, error alert + entry kept + re-translated on language change + Try again, newest-first list, a language change in the middle of a request (button stays locked, one POST), 422 summary, Chat link reaches CHAT through the registry, no horizontal scroll at 375 px, no page or console errors. I also looked at screenshots (en and fa, 375 px).

## Not verified
- The real vitest runner (and jsdom): my two test files and the browser harness were not run under it. The **browser harness is not in the zip** (it has local paths).
- **Existing tests I was not allowed to open and that this part can break** (please let me read them, or run the suite): `smoke/my-profile-tabs-18a.test.ts` (the Distractions tab used to be the generic empty guide / "ready" text and is now the form), and any test that asserts the old `panels.distractions.intro` / `ready` text, or the order of children in `#my-profile-view` (the overview now sits before the tablist), or that panels have no `tabindex`.
- Screen-reader output; how the CSS looks in the light theme. Persian copy is mine (`distractionsForm` and `overview` in `fa.ts`).

## Left undone
- The unknown-sections decision above (no auto-load).
- `profile/habits` and `profile/energy` are still placeholder routes in the registry (open since 17a-2).
- No edit or delete of a saved distraction (the API has none).

## 5-step manual check
1. Open My profile (Smart profile). Check: "What's still empty" lists six sections with words (not colour only); sections you have not opened say "Not checked yet" with an "Open" button. Click **Open** on Distractions: the tab opens and the focus is on its panel; the row now says Empty with "Fill in", and "You can fill these in by chatting" + "Open chat" appears.
2. In Distractions type "phone" (and "10" minutes), then enter "1.5" in minutes and leave the field. Check: the error is shown, Save is disabled, "Show what needs fixing" appears. Fix it, press **Save distraction**. Check in DevTools > Network: exactly one `POST /user-intelligence/distractions` (body trimmed, minutes a number) and no GET after it; "Distraction saved." appears, the record is on top of "Saved distractions", the entry is empty.
3. Look at the overview without reloading: Distractions says **Filled** and has no button. Type a new entry, then **switch the language** (fa <-> en): no request in Network, the tab stays open, the text you typed is still there, labels and any error are in the new language.
4. With text in the form press **Discard changes**: the fields go blank, errors vanish, "Changes discarded." shows, and Network shows no request. Then go offline and Save: the error shows and your entry is kept; switch language: the error re-translates; go online and press "Try again".
5. Click "Open chat" in the overview: you land on the Chat page. Open the other tabs (Habits, Energy, ...) and fill one: its row flips to Filled; when no row is Empty the hint disappears.
