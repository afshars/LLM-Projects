# HANDOFF - agentic chat pivot (project-ui2-part22, update 2: reload persistence + clutter removal)

## Status
Partial but coherent snapshot. NOT built or test-run: the sandbox had no network, so pytest, vitest, `npm run build`
and `npm run check:i18n` were NOT run (this applies to everything below, including all NEW tests). Checks that WERE
run: `compileall` on backend/app + backend/tests; the real `priority_engine` on the scenarios the plan tests assume;
`tsc --noEmit` on frontend/src (only the baseline TS2882 "Cannot find module ... .css" errors in main.ts, caused by the
missing vite/client types; the new chat-plan.css import adds one of the same kind). Whether this snapshot runs is
UNKNOWN until the commands in "Install / run / verify" pass.

## Update 2 (this session)
1. Persist chat + plan on reload
   - backend: `GET /conversation/{id}` now returns `messages` (stored transcript, oldest first; each assistant message that
     produced a plan carries it at its CURRENT status proposed/confirmed/superseded, read from DailyPlanRecord) and `plan`
     (latest non-superseded plan, else null). New schema `ChatHistoryMessage`; transcript entries now carry an `at` ISO
     timestamp (older entries: `at` null). Legacy question-engine sessions -> `messages: []`, `plan: null`.
     Files: schemas/conversation.py, services/agent_orchestrator.py (`get_history`), api/routes/conversation.py.
   - frontend: the conversation id is now stored in localStorage (`maketime_conversation_id`,
     new src/state/conversation-storage.ts) for signed-in users, written on every journey emit and cleared on
     logout/401/new conversation/goal CTA. After a reload the chat view mounts with an id and no messages, which already
     triggered `restoreConversation`; `journey.completeRestore` now rebuilds the messages (ids `restored-N`) incl. plan
     cards, and leaves `restored` false so the "earlier messages can't be shown" note appears only for legacy sessions.
     Messages already on screen are never replaced. The feed is aria-live "off" while a restored history is painted.
     chat.ts: a superseded plan renders as "Replaced by a newer plan" with no buttons; confirmed shows the badge.
2. Legacy clutter removed from views/chat.ts: no "What I know so far" panel, no stage badge / intent label, no stage live
   region; `.chat-body` is feed + dock only (style.css: full-width grid when the aside is absent). The closed/ready note
   (`createStageNote`) is kept for legacy conversations. chat-status.ts still exports createInfoPanel/createStageMeta/
   createStageLive (now unused: safe to delete).
3. Tests added/changed (never executed): backend tests/test_agent_orchestrator.py (+4 GET tests);
   smoke/chat-plan-restore.test.ts (new); smoke/conversation-restore.test.ts (+transcript hydration, +id persistence);
   smoke/chat-side-panel.test.ts (panel/badge/live-region tests replaced by "clutter is gone" tests).

## Update 3: bilingual (FA/EN, RTL/LTR) + theme (Dark/Light) audit
Items "persist chat + plan on reload" and "remove the stage badge / info panel" were already done in Update 2 (unchanged here).
Audit results:
- Theme tokens: chat-plan.css uses ONLY tokens from styles/tokens.css, no literal colours. Every colour token it uses
  (--color-surface, --color-text, --color-text-muted, --color-border, --color-border-strong, --color-accent(-rgb),
  --color-success(-rgb), --shadow-card) is defined for both :root/dark and [data-theme="light"]; spacing/radius/text/blur
  tokens are theme-independent. The token names suggested in the request (--color-bg-surface, --color-text-primary,
  --color-border-subtle) do NOT exist in this project; the equivalents above are the semantic ones.
- Contrast fix: accent/success coloured TEXT is too pale in Light (accent ~2.8:1, success ~3.8:1 on white). The time and
  the "Confirmed" badge now use --color-text; accent/success only tint the row / pill background and border.
- RTL/LTR: logical properties only (inline/block, padding-inline, border-block-start, grid columns mirror automatically);
  no physical left/right/width/height. Time range is dir="ltr" inside the RTL card, titles dir="auto", digits and the date
  come from Intl with the UI locale (Persian digits and calendar in fa).
- i18n: all card text is in growth.chat.plan (en.ts + fa.ts): title, listLabel, confirm, confirming, tweak, tweakMessage,
  confirmedBadge, replacedNote, skippedTitle, minutes(n), energy.{low,medium,high}, skipReasons.{no_capacity,no_fit,
  dependency_unmet}. Skip reasons are translated from the backend's `reason_code`; the Persian backend text is only a fallback.
  The only literals in the card code are punctuation (the en dash in the time range, " - " before a skip reason).
  UI label for the tweak button is "Needs changes" / "نیاز به تغییر" (the Persian wording, translated literally).
- Parity: `npm run check:i18n` could NOT be run (needs vite-node). I replicated its checks by compiling en.ts/fa.ts with tsc
  and comparing them in node: 1625/1625 leaves in both languages, no missing keys, no empty values, no placeholder or
  function-arity mismatches, 16 plan-card leaves all translated (no identical en/fa). fa is also typed `typeof growthEn`, so
  tsc enforces key parity. Run the real script before merging.
- Packaging: backend/app.db is EXCLUDED from this archive (it is a SQLite file with real user rows / password hashes).
  The app recreates the schema on startup (init_db), so nothing is lost; restore your own copy locally if you need the data.
  Also excluded: node_modules, dist, .git, __pycache__, .env*.
- Still unverified (no browser/network here): visual check in Light and Dark, at 375px and in RTL; vitest; pytest; npm run build.

## Completed (files)
Backend
- app/db/models.py: `DailyPlanRecord` table; `ConversationSession.transcript` column. app/db/database.py: migration for it.
- app/schemas/conversation.py: `AgentDecision`, `PlanTaskArg`, `ScheduleBlockArg`, `SkippedItemOut` (+reason_code),
  `ChatPlanOut`, `ConfirmPlanResponse`; `ConversationTurnResponse.plan`.
- app/services/agent_orchestrator.py (NEW): tool loop (ask_clarification / generate_daily_plan / reply), plan building via
  priority_engine (chat tasks) or DailyFlow.run() (empty tasks), persistence, supersede, `confirm_plan`.
- app/api/routes/conversation.py: start/continue -> agent; NEW `POST /conversation/plans/{plan_id}/confirm` (404 not found/not owned, 409 superseded).
- Legacy notes: services/conversation_manager.py, services/question_engine.py (kept, bypassed), orchestrator/daily_flow.py (docstring corrected).
- tests/test_agent_orchestrator.py (NEW, 13 tests); tests/test_api.py conversation test rewritten.
Frontend
- src/api/types.ts (ChatPlan*, ChatMessage.plan), src/api/client.ts (`confirmChatPlan`).
- src/views/chat.ts: inline "Today's plan" card, Confirm (calls confirm endpoint) / Tweak (sends the user's own message).
- src/growth-os/i18n/en.ts + fa.ts: `growth.chat.plan` block. src/styles/chat-plan.css (+ import in main.ts).
- Nav: `hidden?: boolean` on NavRoute (growth-os/types.ts); hidden = plan/interview, plan/busy-blocks, profile/energy,
  profile/habits (registry.ts); src/lib/section-subnav.ts skips hidden tabs unless active; smoke/shell.test.ts updated (3 tabs; 4 while a hidden route is open).

## Design decisions / deviations from the task text
- Tool calling = structured output (`with_structured_output(AgentDecision)`), not `bind_tools` (project's single LLM gateway, works with fake_llm). Swap only `_decide()`.
- Chat tasks are not NextActions -> scheduled directly with priority_engine; highlight_task_id is null for them. Empty tasks -> DailyFlow (saved NextActions).
- energy_level applies to chat-task plans only (low/high -> DailyFlow's two levels, medium = no constraint); saved EnergyProfile is never overwritten.
- Added optional `active_hours` arg to generate_daily_plan (saved to profile) so new users are not stuck.
- Agent sessions stay in stage "discovery" (a "ready" stage triggers the old "tell me your goal" hint).
- The task text calls daily_flow.py an unconnected skeleton; it is the real planner behind GET /daily-plan. The Phase 5-10 services it names (personality, life_balance, learning_loop) remain unwired - untouched.
- Updated test: tests/test_api.py::test_conversation_start_and_continue_end_to_end (old questionnaire flow no longer routed).

## Incomplete / not done
- plan-interview-chat.ts is NOT merged into chat.ts or deleted (interview + proposal flow + their tests remain; tab only hidden).
- Goal stepper (multi-step form) not hidden/changed.
- Dead code left in chat-status.ts / lib/chat-info.ts / en+fa `chat.info.*` keys that only the removed panel used (closedNotice etc. are still used).
- Transcript is capped at the last 40 messages; the plan-id link survives, but very old cards drop out of the history.
- Stored conversation id is shared by everyone using the same browser profile until logout/401 clears it; a 404 on restore shows the existing "start a new conversation" button.
- Backend and frontend tests were written but never executed; expect possible small fixture mismatches.

## Install / run / verify
Backend:  cd backend && pip install -r requirements.txt && pytest tests -q
          (focus: test_agent_orchestrator.py, test_api.py, test_conversation_manager.py - legacy functions are kept)
Frontend: cd frontend && npm ci && npx tsc --noEmit && npm run build && npm run check:i18n && npx vitest run
Zip exclusions: node_modules, dist, .git, __pycache__, .env*, backend/app.db (real user data).

## Next steps
1. Run the commands above; fix whatever fails (likeliest: new tests; any test that boots the journey with a leftover
   `maketime_conversation_id` in localStorage - clear it in that test's beforeEach).
2. Vitest for the plan card interactions: confirm success / 409, Tweak sends the message, older card shows "replaced".
3. Delete the dead panel code listed above; retire plan-interview-chat.ts and the interview/proposal flow with their tests.
4. Browser pass at 375px and in RTL (fa): plan card, restored history, full-width chat grid after the aside removal.
