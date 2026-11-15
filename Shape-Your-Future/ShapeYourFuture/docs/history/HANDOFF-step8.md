# HANDOFF step8 (backend: remove unreferenced services, graphs, models, tests)
## What changed
- Deleted 13 modules nobody imports (AST import graph from app.main, incl. in-function imports; names in comments/docstrings only): graphs brain_dump/growth/planning_graph; services decision_engine(+_contract,_impl), decision_candidate_adapter, decision_trace, personality, planning_proposal, scheduling, behavior_analysis; schemas/behavior.py.
- Deleted 11 tests of those modules (decision_engine*, decision_candidate_adapter, decision_trace, behavior_analysis, personality, planning_graph_*). test_services.py keeps only the 2 tone_lint tests.
- Dead classes removed: models PlanningProposal, BrainDumpItem (0 references; existing DBs just keep unused tables); 12 schemas in schemas/chains.py; 4 TypedDicts in graphs/state.py. List: step8-deleted-files.txt (24 files).
## Kept on purpose (still imported by a kept route)
- /daily-plan and /daily-plan/now -> orchestrator/daily_flow -> priority_engine, time_blocking, busy_blocks, behavioral_*, adaptation_*, learning_loop, life_balance, goal_engine, user_intelligence, memory_layer, context_builder, aggregation, next_action_mapper, daily_coach.
- /conversation -> agent_orchestrator, conversation_manager -> question_engine, user_intelligence. /focus -> daily_coach, focus_feedback, focus_session_store, goal_engine. tone_lint kept as asked.
- Removing these needs the daily-plan routes rewritten (Phase 5 daily_entry), not a grep-delete.
## Checks
- RUN: AST import graph: 0 unreachable modules except tone_lint; every `from app.x import y` in app/ and tests/ resolves (0 unresolved); compileall app+tests OK.
- NOT RUN: pytest -q, app boot (no fastapi/pytest here, no network). Run: cd backend && pytest -q. Expect 4 known rate-limit failures (B5/B6) and 74+ fewer tests than before.
## Git commit message
refactor(backend): remove decision engine, planning/brain-dump/growth graphs, personality, behavior analysis and dead models
