# Part 19b — Chat additions: side panel, stage and intent display (HANDOFF)

Read: HANDOFF-part3 (shared UI), HANDOFF-part19a (state shape), `views/chat.ts`, `state/journey.ts`, backend `question_engine.py` / `schemas/conversation.py`.

## What it does
- **Side panel "What I know so far"** from `knownInformation` (shape from 19a: `topic -> { field -> value }`) plus **"Still missing"** from `missingInformation` (list of topic names). Topics/fields are translated; unknown keys fall back to plain text ("some_key" -> "some key"). Blank values, the words null/undefined, objects and non-objects never render (no "null", "undefined", "[object Object]"). Nothing to show -> one sentence that the panel fills in as you chat.
- **Layout:** `.chat-body` grid = feed, `<aside>`, dock. Desktop (> 900px): panel is a side column (`--sidebar-width`). <= 900px (375px): the panel is a collapsible section between feed and composer; a button with `aria-expanded` + `aria-controls="chat-info-body"`. Open/closed is a module variable, so it survives a language re-render; it resets when leaving CHAT. Tokens + logical properties only; `min-inline-size: 0`, `overflow-wrap: anywhere`, grid `minmax(0, …)` so no horizontal page scroll.
- **Stage badge**: "Stage: <label>" with text (dot is decorative). Labels for discovery / ready / closed are translated; any other value is shown as plain text. **Intent**: translated when in the known list, otherwise plain text (textContent only).
- **Ready**: a note above the composer. With a captured goal it points at the existing "Convert to Goal Roadmap" CTA (the flow is goal -> `createGoal` -> decomposition, Part 19a/chat.ts); without a goal it asks for the goal in one sentence (the CTA needs `goal_discovery.goal_text`).
- **Closed**: textarea, send and chips disabled, closed placeholder, note + **Start a new conversation** (`journey.startNewConversation()`, keeps the draft, then focuses the input because the user pressed the button).
- **Live region** `#chat-stage-live` (`role=status`, `aria-live=polite`). Only text is written; focus is never moved on a stage change. The last announced stage is module-level, so a language/theme re-render does not re-announce.
- **Language change**: everything is built from `journey.get().conversation` at render time. No fetch, no clearing (a test checks the call count).

## Files
New: `frontend/src/lib/chat-info.ts` (pure helpers), `frontend/src/views/chat-status.ts` (DOM parts), `frontend/smoke/chat-side-panel.test.ts`, `HANDOFF-part19b.md`, `existing-files-19b.patch`.
Changed: `views/chat.ts`, `style.css` (new section "Chat additions (Part 19b)"), `growth-os/i18n/en.ts`, `growth-os/i18n/fa.ts` (`growth.chat.info.*`).

## Exported names
- `lib/chat-info.ts`: `displayText`, `humanizeKey`, `buildKnownGroups`, `buildMissingLabels`, `stageInfo`, `intentLabel`, `isStageClosed`, `KNOWN_STAGES`, `KNOWN_INTENTS`, types `KnownGroup`, `KnownItem`, `StageInfo`, `StageKind`.
- `views/chat-status.ts`: `createStageMeta`, `createStageLive`, `createInfoPanel`, `createStageNote`, `resetChatStatus` (called from `disposeChatView`), `CHAT_IDS`.

## Container ids
`chat-meta`, `chat-stage-badge`, `chat-intent`, `chat-stage-live`, `chat-info-panel`, `chat-info-title` (desktop heading), `chat-info-toggle` (mobile button), `chat-info-body`, `chat-stage-note`, `chat-info-known-title`, `chat-info-missing-title`.

## i18n (fa + en)
`growth.chat.info`: `panelTitle, panelEmpty, missingTitle, missingNone, stageLabel, intentLabel, stages{discovery,ready,closed}, stageAnnounce(fn), intents{…}, topics{8}, fields{12}, readyHintGoal(fn), readyHintNoGoal, closedNotice, closedPlaceholder, startNew`. Persian copy is mine (topic names match the backend's `TOPIC_LABELS_FA`).

## Verified
- `npm run check:i18n`: OK (en 1721 / fa 1721).
- `tsc --noEmit`: no error in any file I touched or added.
- New `smoke/chat-side-panel.test.ts`: 10 tests pass (null-safety, unknown intent/stage as plain text with no HTML injection, empty state, toggle aria + no focus move, language switch with no extra fetch, ready hint, announce-once, closed + start new). `conversation-restore` and `shell` tests still pass.
- Full vitest run: 90 tests fail in 6 files (my-profile-*, ui-habits-*, plan-confirm-feedback). **Identical failures on the untouched 19a zip**: they come from the three files missing from the zip (see below), not from this part.

## Not verified / open
- **No visual check** (no browser here): the grid, the 375px collapsible section, badge colours in both themes and RTL mirroring need a look. In particular check the panel height at 375px with the keyboard open (`max-block-size: 40dvh`).
- **Known-intent list is short**: only the three examples the backend documents (`learn_programming`, `career_growth`, `reduce_procrastination`). The LLM returns free text, so most intents will show as plain text. Extend `KNOWN_INTENTS` + `info.intents` as real values appear.
- `closed` is never produced by the backend today (19a), so that path is only exercised in tests.
- On a restored conversation (19a) messages are still missing; the panel works because it uses state only.
- Still missing from the zip (from 19a, unchanged): `src/state/active-hours.ts`, `src/state/ui-profile-form.ts`, `src/views/my-profile-active-hours.ts`. `tsc -b` / `vite build` cannot pass without them.
- Not done: no panel for the 429/500 restore error beyond what 19a shows; the panel does not let the user edit known information (read-only by design).
