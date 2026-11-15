# Part 21a: coverage matrix, step 1 - endpoint -> client method (HANDOFF)

Documentation only. No backend logic, contract, `api/client.ts` or `api/types.ts` changed (there are no real gaps to stub).

## How the lists were obtained
- Endpoints: no list was pasted, so I generated the real OpenAPI document from the backend code in the zip (`app.openapi()`, FastAPI 0.115.0, deps installed from `backend/requirements.txt`). 65 operations on 52 paths. operationIds come from FastAPI's defaults.
- Client: `frontend/src/api/client.ts`, `apiClient`: 68 members = 66 methods with a literal path + `submitPlanning` and its alias `updateNextActionPlanning`.
- Each of the 66 methods was checked by script against the client source (HTTP verb + path) and against the OpenAPI list.

## Counts
- Total endpoints: **65**
- Mapped: **64** (63 with a hard-coded path, 1 via the caller-supplied `planning_endpoint`)
- Without a client method: **1** (intentional)
- Real gaps: **0**
- Client methods matching no endpoint: **0**

## Gaps
- (none real)
- `GET /healthz`: intentional (Docker HEALTHCHECK, `backend/Dockerfile` line 40).

## Unclear from the signature
`PUT /goals/next-actions/{action_id}/planning` -> `submitPlanning(planningEndpoint, payload)` / `updateNextActionPlanning`. The path is a parameter, not in the method. Confirmed from the backend: `routes/goals.py:194` builds exactly this path into `planning_endpoint`. If that backend string ever changes, the client would not notice.

## Overlaps to remember in 21b
Two client methods share one endpoint for: `PUT /user-intelligence/profile`, `/energy`, `/habits` (narrow shortcuts `updateActiveHours`, `updateEnergyLevel`, `updateSleepHabit`) and the planning PUT (`submitPlanning` / `updateNextActionPlanning`).

## Not checked
- Response/request TypeScript types against the backend schemas (not part of this step).
- Whether any screen calls each method (that is 21b, column `UI page` = `?`).
- No tests were added or run: documentation only.

## Files
New: `docs/growth-os/08-coverage-matrix.md`, `HANDOFF-part21a.md`. Nothing else changed.
