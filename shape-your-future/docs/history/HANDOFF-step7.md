# HANDOFF step7 (backend: remove routes of removed features)
## What changed
- Removed routers (grep first: only main.py imported them): goals, behavior, busy_blocks, planning_proposals, user_intelligence. main.py includes updated.
- chains.py: removed /chains/brain-dump(+confirm), /plan/interview, /plan/propose, /growth/run, /growth/confirm. Kept /plan/confirm, /progress-check(+confirm).
- schemas: deleted goals.py, planning_proposal.py; schemas/chains.py lost 7 request/response classes only those routes used.
- New app/api/ownership.py (get_owned_next_action, moved from goals.py) used by focus.py and chains.py.
- Kept as asked: auth, profile, conversation (incl. plans/confirm), focus (incl. /feedback), daily_plan, plus /daily-plan/now (frontend still calls it).
- Tests: deleted 6 files (goals_api, user_profile_validation, busy_blocks_api, next_action_planning_update_api, decompose_planning_contract, minimum_viable_user_journey); removed 11 route-only tests from 6 mixed files; retargeted 2 tests (/chains/progress-check auth, /daily-plan limiter); crash_regressions now asserts removed routes answer 404/405; new test_ownership.py (3).
- AUDIT file: B2 + 2 routes of B1 marked OBSOLETE.
## Checks
- RUN: pytest -q (backend): 4 failed, 1533 passed. Same 4 as before this step (rate-limit B5/B6, still open). Before: 4 failed, 1607 passed (74 fewer tests = deleted features).
- RUN: pyflakes on app/: no new warnings. RUN: every frontend client path checked against app.routes.
- NOT RUN: frontend tsc/vitest/build (no frontend change), docker, real LLM.
## Open / next
- frontend api/client.ts createGoal still calls POST /goals (route gone; only the gated-off chat CTA uses it): remove in a frontend step.
- Services, graphs, models of removed features remain (orchestrator, goal_engine, planning_graph, behavior_analysis...): next step.
- Chat plan confirm, focus feedback and /daily-plan/now kept only because the frontend still uses them.
## Git commit message
refactor(backend): remove goals, behavior, busy-blocks, planning-proposals, user-intelligence and brain-dump/plan/growth routes
