# HANDOFF - chat history (list, open, new chat) + agent fixes
Changed files only (copy over the project, same paths). Delivered as a zip of changed files.

Backend
- GET /conversation: the user's conversations that have >=1 message, newest first (title = first user message, max 60 chars). No LLM.
- agent_orchestrator.py: list_conversations(); unparseable model output is retried once, then the model's plain text (or the fixed fallback) is used instead of a 500;
  chat plans no longer use energy as a placement filter; one prompt rule against repeating answered questions.
- Checks that RAN: pytest tests/ -> 1549 passed, 4 failed in test_general_api_rate_limiting.py (the same 4 fail on the original code, not touched here).

- Replies can no longer show a plan that was not built: a made-up plan note (or 2+ written time ranges) with no saved plan makes the agent
  correct the model once ("call generate_daily_plan"); if it persists the user gets a plain "no plan was built" line. The internal card note now uses
  an unusual bracket format and any imitation of it is stripped. 7 tests (fail on the old file, pass now).

Frontend
- Chat toolbar: "History" (panel with earlier conversations, fresh fetch on open) and "New chat". Opening one runs restoreConversation(id).
- journey.ts: conversation.history {open,status,items,errorKind}; openConversation(id). state/conversation-history.ts loads the list.
- i18n fa + en (growth.chat.history), styles/chat-history.css, smoke/chat-history.test.ts (17 tests).
- Checks that RAN: tsc --noEmit ok; npm run check:i18n ok; npm run build ok; vitest run -> 106 files, 2294 tests passed.
- Looked at in a headless browser (Chromium, mocked API): fa/RTL desktop and 375px. Not checked: Light theme, en on mobile, real LLM.

- chat.ts: the first-visit welcome buttons (Brain Dump / create a goal) are dropped as soon as the chat has a message
  (the flag was never cleared while the journey stayed on CHAT). 3 tests; they fail without the fix (checked).

Not done: delete/rename a conversation; conversation titles are not editable.
Do NOT overwrite backend/app.db with anything from this zip (it is not included).

Commit: feat(chat): conversation history list, new chat, and agent robustness fixes
