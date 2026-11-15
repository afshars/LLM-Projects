# Part 19a — Chat additions: conversation state, id tracking and restore (HANDOFF)

## Schema findings (read from the backend, not guessed)
Files read: `schemas/conversation.py`, `api/routes/conversation.py`, `services/conversation_manager.py`, `services/question_engine.py`, `core/rate_limit.py`, `core/config.py`, `db/models.py` (ConversationSession). Part 2's HANDOFF is **not in the zip** (only Part 3 is), so I could not read it.

- **`known_information`: a dict of dicts** — `dict[str, dict[str, str]]`, `topic -> { field -> value }` (e.g. `{"goal_discovery": {"goal_text": "..."}}`). Not a list. Already typed that way in `api/types.ts`.
- **`missing_information`: a list of strings** — `list[str]`. Each string is a **topic name** still to ask about, in priority order (`compute_missing_information`). Not objects.
- **`GET /conversation/{id}` returns NO messages.** `response_model=ConversationTurnResponse`, the same shape as start/continue, with `question_fa: null` and `done = (stage != "discovery")`. Fields: `conversation_id, question_fa, done, current_topic, detected_intent, conversation_stage, known_information, missing_information`. The DB row keeps the user's last 10 answers (`recent_answers`) but they are not returned, and the assistant's questions are not stored at all. **So the message history cannot be rebuilt from this endpoint.**
- **No list-conversations endpoint exists.** The only routes are `POST /conversation/start`, `POST /conversation/continue`, `GET /conversation/{id}`.
- Other facts: `conversation_stage` is only ever set to `"discovery"` or `"ready"` by the backend (`"closed"` is never produced). `GET` is a pure DB read: no LLM call and no `@limiter.limit` (only start/continue have the 20/min limit and the LLM). A 5xx on GET is therefore kind `server`, not `llm_unavailable`. 404 = unknown id or another user's id (same status).

## What changed because of the findings (deviations from the task wording)
1. **Restore rebuilds the state fields, not the messages.** `messages` and `draft` are left untouched. After a successful restore the view shows one quiet note ("Reconnected… earlier messages can't be shown here") and hides the quick-starter chips. The backend still holds the pending `current_topic`, so the user's next message answers a question they cannot see on screen. Fixing that needs a backend change (return the last question, or store/return messages).
2. **`stage` was not renamed.** The existing field `stage` already holds `conversation_stage`; I kept it (renaming would touch `chat.ts` for nothing). `detectedIntent` and `knownInformation` also already existed. New: `missingInformation`, `restoreStatus`, `restoreErrorKind`, and one extra flag, `restored`.
3. **"Id but no messages" also happens without a remount**: `send()` stores the id after `/start`, and if `/continue` then fails the bubble is removed. So the trigger is "id + no messages + **fresh mount**". A re-render caused by a language/theme change is not a fresh mount (see below).

## New state (`state/journey.ts`, `ConversationState`)
```ts
type RestoreStatus = "idle" | "restoring" | "error";
missingInformation: string[];            // from every start/continue/GET response
restoreStatus: RestoreStatus;
restoreErrorKind: ApiErrorKind | null;   // ApiError.kind only; text is built at render time
restored: boolean;                       // a restore succeeded (stops repeat restores, drives the note)
// existing, now also fed by GET: conversationId, stage, detectedIntent, knownInformation, currentTopic, isDone
```
Store actions added: `beginRestore()`, `completeRestore(turn)`, `failRestore(kind)`, `startNewConversation()` (clears everything **except the draft**). `recordTurn` now also stores `missingInformation` and clears a stale restore error. `setConversationId(null)` also clears the restore state. The id is stored as soon as `/start` returns (it already was; now with the new fields).

## `restoreConversation` (`state/conversation-restore.ts`, new)
```ts
restoreConversation(id: string): Promise<void>           // never throws
shouldRestoreOnMount(conversation: ConversationState): boolean
```
`GET /conversation/{id}` -> `completeRestore(turn)`. On failure it stores `restoreStatus: "error"` + `ApiError.kind`. A second call for the same id shares the running request. A 401 goes through `handleAuthExpiry`. A result for an id that is no longer current (logout, "start a new conversation") is dropped. `shouldRestoreOnMount` = id, no messages, status `idle`, not already restored, not awaiting.

## Chat view (`views/chat.ts`)
- **Language change never restores/refetches/wipes:** a module flag `chatMounted` is set by `renderChatView` and cleared by `disposeChatView` (app.ts calls that only when leaving CHAT). Only the first render after a dispose may call `restoreConversation`. The draft lives in the store and is re-applied by `sync()`.
- While `restoreStatus === "restoring"`: a status line, and send / chips are disabled.
- Error banner (text via `errorMessage(..., "conversation-restore")` at render time, so it flips language): **404** -> "We couldn't find this conversation…" + **Start a new conversation** (`startNewConversation()`); **429** -> the existing "Please wait a moment…" + **Try again**; **500 / network** -> server message + **Try again**. (The task asked for a retry button on 500 only; I also left one on 429 so the user is not stuck.)
- New i18n (fa + en): `growth.chat.{restoring, restoredNote, restoreRetry, restoreStartNew}`, `errors.conversationNotFound`; new `ErrorContext` `"conversation-restore"` in `lib/dom.ts`. `api/client.ts`: comment only.

## After a full page reload
The id is only in the in-memory store (no localStorage / sessionStorage / URL; checked in the browser run), so it is gone: the store starts empty, the chat shows the greeting, nothing is restored and no GET is made. The next send creates a new conversation. **Possible recovery:** there is no list endpoint. A small backend route such as `GET /conversation?limit=1` (latest conversation of the current user; `ConversationSession` already has `user_id` and `updated_at`) would let the chat find the id after a reload. I did not build it (it is backend work, and the history would still be missing).

## Verified
- `tsc --noEmit`: no error in any file I touched. `scripts/check-i18n-parity.ts` (run with tsx): OK, en 1683 / fa 1683.
- **Real app in headless Chromium, backend mocked: 42 checks pass** (esbuild bundle of `src/`, fetch mocked at network level). Covers: language change (en<->fa, twice) with id and no messages makes no GET and keeps the draft; a real remount makes exactly one GET and fills stage/intent/known/missing; no second GET on later remounts or language changes; the note and error texts flip language; 404 / 500 / 429 messages and buttons, retry, "Start a new conversation" keeps the draft; send disabled while restoring; a language change mid-restore adds no request; a stale result is dropped; 401 -> Auth; start/continue update all fields; a full reload leaves no id and no GET. I broke the fresh-mount guard on purpose and 2 checks failed, then restored it. That harness is a scratch script and is **not** in the zip.

## Not verified / open
- `smoke/conversation-restore.test.ts` (new, vitest, state + flow only, 8 tests) was **not run**: vitest and jsdom are not installed and there is no network. The same behaviours were checked by the browser run above. Please run `npx vitest run smoke/conversation-restore.test.ts`.
- No `vite build` / full `tsc -b`: no `node_modules`. And the zip is **missing three files that other files import**, so `tsc -b` fails before my change too: `src/state/active-hours.ts`, `src/state/ui-profile-form.ts`, `src/views/my-profile-active-hours.ts` (imported by `ui-profile-save.ts` and `my-profile-profile-form.ts`). I did not recreate them; for the browser run I stubbed them in a scratch bundle only. Please check they exist in your repo.
- No visual check (the `.chat-restore` CSS is new, tokens only, logical properties); Persian copy for the new keys is mine.
- Existing behaviour left as is: on a 404 from `/continue`, `send()` still shows its old translated-at-write `notice` and drops the id; stale `knownInformation` then stays until the next turn.

## Files
New: `frontend/src/state/conversation-restore.ts`, `frontend/smoke/conversation-restore.test.ts`, `HANDOFF-part19a.md`, `existing-files-19a.patch`.
Changed: `frontend/src/state/journey.ts`, `frontend/src/views/chat.ts`, `frontend/src/lib/dom.ts`, `frontend/src/lib/dictionary.ts`, `frontend/src/growth-os/i18n/en.ts`, `frontend/src/growth-os/i18n/fa.ts`, `frontend/src/style.css`, `frontend/src/api/client.ts` (comment only).
