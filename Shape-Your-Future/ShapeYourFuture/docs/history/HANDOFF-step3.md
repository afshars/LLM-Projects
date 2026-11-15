# HANDOFF - Step 3: remove dead backend code

Done
- Backend: routes daily_plan/focus/next_action_now, 22 of 23 services (only coach_tactics stays), orchestrator/, ownership.py, llm/json_decision.py, tone_lint, 5 schema files, 20 legacy models, 34 test files deleted. main.py registers 4 routers; models.py = User + DailyEntry.
- DB: backend/scripts/legacy_tables.py (SQLite, stdlib): report / drop (verified JSON backup first) / restore. App never drops tables itself.
- Frontend: stores daily-plan, next-action-now, focus-flow; views focus-execution, focus-running-banner; focus parts of journey/today/step-indicator; /daily-plan and /focus client methods; 67+ unused types; dictionary plan/focus/feedback groups; "Coming soon" strings (en+fa) -> shell.missing; dead CSS.
- convertToGoal / its flag were already gone (Step 2).
- tone_lint deleted: LLM free text (evidence_fa) is never shown or stored; tactic text is a fixed catalogue.

Counts (before -> after): backend 29,276 -> 4,287 lines; frontend 12,904 -> 10,407; services 23 -> 1; routes 7 -> 4; tables 22 -> 2; backend test files 46 -> 14.

RUN: compileall; static import resolution (backend, 0 problems; frontend relative imports); tsc (only the 2 missing-font-package errors that exist without node_modules); i18n parity (223 = 223); legacy_tables.py on a fake DB (round trip identical); its 6 tests via a pytest stand-in.
NOT RUN: pytest, app startup, vitest, npm ci, vite build, test_daily_entry_migration.py.

Flagged: dead Step values (DASHBOARD, CONTEXT_SETUP...) and the step-indicator wizard remain (AUDIT row 12); backend/docs/*.md and docs/growth-os/08 describe deleted code (kept as history); 4 rate-limit tests failed before this step (AUDIT rows 3-4).
