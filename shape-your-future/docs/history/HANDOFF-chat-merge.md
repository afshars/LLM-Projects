# Handoff: AI chat added to the Coach page

The Coach screen has two parts side by side (they keep these physical sides in Persian and English):

- **left**: today's Highlight (read-only card) + the "One tactic for today" card (unchanged behaviour)
- **right**: the AI chat, taken from the `final` version (same look, history panel, restore after reload)
- on a phone (<= 900px) they stack: Highlight + tactic first, chat below

## Frontend
- `views/coach.ts`: `renderCoach()` builds the layout (same signature as before); `mountCoachChat()` paints the chat once the layout is in `<main>` (app.ts calls it).
- `views/coach-chat.ts` (from final's `chat.ts`), `views/coach-highlight.ts`, `views/view-context.ts`.
- `state/journey.ts`: conversation state + `subscribeConversation`; `state/conversation-{storage,history,restore}.ts`.
- `api/client.ts` + `api/types.ts`: `/conversation/*`; the chat dictionary is `growth.chat`, Coach copy is `growth.coach`.
- `styles/chat.css` (layout + chat), `styles/chat-history.css`.
- NOT carried over from final (end3 has no such backend): the inline "Today's plan" card, "Convert to Goal Roadmap", the stage badge, the "What I know so far" panel, the closed/ready note.

## Backend
- `routes/conversation.py`, `schemas/conversation.py`, `services/chat_service.py`; tables `chatconversation`, `chatmessage` (created by `create_all`, no migration).
- Same response shape as final's `ConversationTurnResponse`; `question_fa` carries the reply, the state fields are fixed empty values, no plan.
- The chat READS today's Highlight (as context for the model) and never writes `dailyentry`. A failed model call stores nothing.
- Tests: `tests/test_conversation.py`; `test_coach_approval_rule.py` / `test_crash_regressions.py` were updated for the new tables, routes and the second LLM user. `scripts/legacy_tables.py` treats the two chat tables as live.

## Not run here
The sandbox had no network, so `pytest` and `vitest` could not be installed. Verified instead: `tsc --noEmit` (strict), `check-i18n-parity`, `py_compile`, and a real-Chromium run of the bundled app against a stub of the backend contract. Run `pytest` and `npm test`-style vitest (`smoke/coach-chat.test.ts` is new) before shipping.

## Fold switches (focus mode)
Two buttons at the end of the chat toolbar: hide/show the left part (Highlight + tactic) and hide/show the navigation sidebar (desktop only; a phone keeps its bottom bar). Remembered in localStorage (`maketime:coach-side-hidden`, `maketime:coach-menu-hidden`; `state/coach-layout.ts`), applied as `data-side` / `data-menu` on `.coach-split` and handled in CSS (`styles/chat.css`).
