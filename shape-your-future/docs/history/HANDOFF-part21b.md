# Part 21b: coverage matrix, step 2 - UI page for every endpoint (HANDOFF)

Documentation only. No backend, contract, `client.ts`, `types.ts` or view changed. Only `docs/growth-os/08-coverage-matrix.md` was rewritten (full file) and this HANDOFF added.

## Evidence
Nothing was pasted this turn, so I read the project zip itself: routes from `growth-os/registry.ts` + `views/section-view.ts` (`ROUTE_VIEWS`) + `app.ts` (`VIEWS`); client calls by searching `src/` (comments stripped; an import alone did not count) and following each call to the view that invokes the store/flow function. Static reading only: no browser, vitest not run.

## Summary
- Total endpoints: **65**
- With a UI page: **63**
- TODO: **2**
- UNVERIFIED: **0**

## TODO list
1. `GET /healthz`: health check (Docker HEALTHCHECK). Intentional.
2. `GET /planning-proposals/{proposal_id}`: `getPlanningProposal` exists in `client.ts` but nothing in `src/` calls it (grep outside `api/client.ts` is empty). The planning screen uses the POST responses. Optional re-fetch or unused client code, not a bug.

## UNVERIFIED
None. Nothing to confirm with a grep. (The matrix file ends with two optional greps that reproduce the key evidence.)

## Things worth knowing
- Several screens are journey steps, not registry sub-routes: AUTH, CHAT, DASHBOARD, CONTEXT_SETUP, GOAL_CREATION, DECOMPOSITION, GOAL_WORKSPACE, PLANNING_REQUIRED, DAILY_PLAN, FOCUS_EXECUTION, FOCUS_FEEDBACK. They are listed as "X step".
- Registry routes with no page of their own: `plan/next-actions` (placeholder to Planning required), `profile/preferences|energy|habits` (open Smart profile tabs), `profile/appearance` (no endpoint). None is an endpoint gap.
- Two screens reach the same endpoint for planning: `plan/planning-required` (`submitPlanning`) and the PLANNING_REQUIRED step (`updateNextActionPlanning`, direct).

## Files
Changed: `docs/growth-os/08-coverage-matrix.md`. New: `HANDOFF-part21b.md`. All other files unchanged.
