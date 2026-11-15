# HANDOFF Step 2: Coach = tactic card only; no AI output saved before approval

Goal: remove the planning chat, keep only "AI proposes one tactic -> user approves -> saved", and show it in the loop.

## Backend
- Deleted: chat/conversation routes, chains routes, agent_orchestrator, conversation_manager, question_engine, progress_graph,
  `ConversationSession` and `DailyPlanRecord` models, `LLM_MODEL_STRONG` plumbing, 5 old test files.
- New: `services/coach_tactics.py` (classify -> map family -> pick -> validate; writes nothing), `api/day.py` (`?day=`).
- `/coach/tactic/suggest` is the ONLY LLM route. It persists nothing (test counts rows of all tables before/after).
- `/coach/tactic/confirm` is the only write; it sets `dailyentry.coach_tactic_*`. Legacy `DailyLog` is never written.
- `DailyEntryOut` has `tactic`, `tactic_applied`; `PUT /daily-entry/today` accepts `tactic_applied` (422 without a tactic).

## Frontend
- Step `CHAT` renamed `COACH`; `views/coach.ts` renders only the card. Nav id/icon `chat` kept (label "Coach").
- Deleted: chat view/status/info, conversation stores, journey conversation slice, chat CSS, collapse feature, `createGoal`.
- Today: read-only "Today's tactic" block. Reflect: Yes/No "Did you use today's tactic?" (auto-save, only with a tactic).
- After confirm, `todayStore.adoptTactic()` updates Today/Reflect without a request.

## Tests
- backend `tests/test_coach_approval_rule.py` (12); frontend `smoke/coach-loop.test.ts` (7), `smoke/coach-tactic.test.ts`.

## Checks (RUN): pytest 1171 passed / 4 failed (known rate-limit tests); tsc ok; build ok; check:i18n ok; vitest 225 passed.
## NOT RUN: Docker build, real browser smoke test, real LLM call.

Commit: Step 2: Coach is tactic-only; AI output saved only after approval; tactic shown on Today and Reflect
