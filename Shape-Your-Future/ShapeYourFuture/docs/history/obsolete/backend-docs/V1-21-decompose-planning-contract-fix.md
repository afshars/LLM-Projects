> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-21 — Decompose → Planning contract fix

Status: **implemented. Two production files changed (additive), one
test file added. No architecture redesigned.**

## 1. Root cause (Phase 1 findings)

Traced end to end:

```
POST /goals/{id}/decompose
  -> goal_engine.auto_decompose(db, goal)
       -> for each category-template milestone:
            Milestone(...) -> Task(...)
            -> NextAction(user_id=..., task_id=..., title=m_tmpl.next_action,
                           estimated_minutes=m_tmpl.minutes)
              # importance / energy_required / difficulty: NEVER PASSED -
              # _MilestoneTemplate (goal_engine.py) has no such fields at
              # all - there is nothing to pass.
  -> DecomposeResponse(objective, project, milestones, tasks, next_actions)
     # (before this change) - no signal of what's missing or what to do
```

Meanwhile, `GET /daily-plan` and `POST /focus/start` both gate on
`next_action_mapper.evaluate_next_action_readiness()`, which requires
`importance`/`energy_required`/`difficulty` all non-`None` **and** a
resolvable ancestor Goal. A decompose-created NextAction always fails
the first condition — by construction, not by accident.

**This is not a bug that crept in — it is a documented, deliberate,
already-audited design decision (V1-14 §6: "Keep the two-stage
lifecycle").** V1-14 explicitly considered and rejected inventing
values inside `auto_decompose()` ("**Defaults are forbidden**" — §7,
Option B), and that rejection is enforced today by a mutation-tested
guard suite
(`tests/test_next_action_planning_readiness_contract.py`, whose own
docstring records that injecting `importance=3` into `auto_decompose()`
"left the entire pre-existing suite green and fails all 11 new tests" —
i.e. any such change is caught immediately). What V1-14 left
genuinely unresolved was its own §6 "known limitation #2": *"The
errors don't say how to fix it... Neither names the missing field(s)
nor a way to supply them."* V1-15 then built the missing piece of
machinery (`PUT /goals/next-actions/{id}/planning`) but never wired it
back to `/decompose`'s own response. **The root cause is exactly that
gap: the fix-up capability has existed since V1-15; nothing before this
step told a caller of `/decompose` that it exists or that it's needed.**

## 2. Decision (Phase 2)

**Alternative approach selected** (V1-21 brief's own fallback path),
**not** the "preferred" one:

`POST /goals/{goal_id}/decompose` does **not** make its own NextActions
planning-ready. It still creates them exactly as before (same
`auto_decompose()`, untouched, same templates, same fields). What
changes is only the **response**: it now says, per NextAction,
whether it's planning-ready, and if not, exactly which fields are
missing and exactly which existing endpoint fixes it.

**Why not the preferred approach:** it would require `auto_decompose()`
to supply real values for `importance`/`energy_required`/`difficulty`.
The only way to do that without violating "no silent defaults" would
be either (a) inventing per-template constants — explicitly forbidden,
enforced by the mutation-tested guard suite (§1) — or (b) a new
LLM-propose-and-confirm step, which V1-14 §7 itself already classified
as *"a product-contract change, not a small fix"* — squarely outside
what V1-21 authorizes ("Do not add unrelated features... do not invent
new planning semantics"). The Alternative approach is the one V1-21's
own brief anticipates for exactly this situation ("If the architecture
intentionally requires planning to remain a separate explicit
operation, then the decompose response must make that state explicit
and machine-readable") and is what V1-14 §7 already named, unbuilt,
as **Option C** — which V1-15 half-built (the endpoint) and this step
finishes (wiring `/decompose`'s response to it).

## 3. Implementation (Phase 3)

**`app/schemas/goals.py`** — added, did not modify any existing field:

```python
class NextActionPlanningRequiredOut(BaseModel):
    next_action_id: int
    missing_fields: list[str]
    planning_endpoint: str

class DecomposeResponse(_ORMOut):
    objective: ObjectiveOut
    project: ProjectOut
    milestones: list[MilestoneOut]
    tasks: list[TaskOut]
    next_actions: list[NextActionOut]
    planning_required: list[NextActionPlanningRequiredOut]   # new
    all_planning_ready: bool                                  # new
```

**`app/api/routes/goals.py`** — `decompose_goal()` only:
- imports `evaluate_next_action_readiness` from
  `app.services.next_action_mapper` (the single existing authoritative
  rule — not duplicated, not reimplemented).
- after `engine.auto_decompose(db, goal)` returns (completely
  untouched), loops over `result.next_actions` and calls
  `evaluate_next_action_readiness(action, goal)` for each — `goal` is
  already in scope (the same Goal `/decompose` was called on; no new
  DB lookup added).
- builds one `NextActionPlanningRequiredOut` per not-yet-ready
  NextAction, naming its `missing_fields` (from the same
  `NextActionReadiness.missing_fields` every other consumer already
  uses) and the exact literal path of the existing V1-15 endpoint,
  `/goals/next-actions/{id}/planning`.
- returns `planning_required`/`all_planning_ready` alongside the
  unchanged existing fields.

**Nothing else changed.** `auto_decompose()`, `_MilestoneTemplate`,
`CATEGORY_TEMPLATES`, `update_next_action_planning()`,
`evaluate_next_action_readiness()`, `DailyFlow`, `/focus/start`, the
Decision Engine, and the Planning Graph are byte-for-byte unchanged —
confirmed by a full directory diff against the archive as received
(§6).

This satisfies every Phase 3 requirement: existing valid behavior is
preserved (additive schema fields only); the V1-15 endpoint is
untouched; no duplicate NextActions or planning records are created
(planning fields still live only as columns on the one `NextAction`
row — `update_next_action_planning()` still does `setattr` + `commit`
on the same row, never an insert); ownership checks are untouched
(`_get_owned_goal` still gates the whole route); the "already
decomposed" idempotency guard is untouched (still the same
`existing = db.exec(select(Objective)...)` check, still 400s on a
second call); no new dependency was added; no unrelated file was
touched.

## 4. API behavior

**`POST /goals/{goal_id}/decompose`** — same request (none), same
200 response shape as before **plus two new fields**:

```jsonc
{
  "objective": {...}, "project": {...}, "milestones": [...],
  "tasks": [...],
  "next_actions": [
    {"id": 10, "importance": null, "energy_required": null, "difficulty": null, ...}
  ],
  "planning_required": [
    {
      "next_action_id": 10,
      "missing_fields": ["importance", "energy_required", "difficulty"],
      "planning_endpoint": "/goals/next-actions/10/planning"
    }
  ],
  "all_planning_ready": false
}
```

Any existing client that only reads the fields that were already
there sees no change at all (purely additive). A client that reads the
two new fields now has everything it needs to close the loop itself,
with no out-of-band knowledge of the contract required.

**`PUT /goals/next-actions/{id}/planning`** (V1-15, unchanged) —
identical behavior to before: partial update of exactly
`importance`/`energy_required`/`difficulty`, explicit-`null`-clears-it
semantics, `ge=1,le=5` bounds, ownership-gated 404. Verified this is
still what a client hits by literally calling it via the string
`/decompose` itself now returns (Phase 4, Test A).

## 5. Tests

All in the new `tests/test_decompose_planning_contract.py`, plus one
piece of pure-function verification. **No pytest execution occurred —
same sandbox constraint as V1-17/18/19/20** (re-confirmed this
session: `import pytest` → `ModuleNotFoundError`; `pip`/`apt` → `403`).
Every claim below is marked honestly:

| Check | Status |
|---|---|
| `test_decompose_reports_planning_required_and_following_it_makes_next_actions_plannable` (brief's Test A) | **[SOURCE]** — written, syntactically valid (`ast.parse` succeeded), traced by hand against real schemas/routes; not run by pytest |
| `test_decompose_response_omits_planning_required_entries_once_all_supplied` (freshness of the reported state) | **[SOURCE]** |
| `test_existing_planning_endpoint_still_works_directly_without_using_decompose_hint` (brief's Test B) | **[SOURCE]** |
| `test_planning_followup_mutates_the_same_row_and_creates_nothing_new` (brief's Test C) | **[SOURCE]** |
| `tests/test_minimum_viable_user_journey.py` (brief's Test D) | **[SOURCE]** — inspected, not modified: it never calls `/decompose` (uses the manual step-by-step path by deliberate design, per its own docstring), so its contract is genuinely unaffected by this change; nothing to update (see §6) |
| The exact new route logic (the `planning_required` loop) | **[EXECUTED]** — extracted verbatim from `app/api/routes/goals.py`, dedented, and run standalone against fake `NextAction`/`Goal` objects (one unready, one already-ready): correctly produced one `planning_required` entry for the unready action only, with the right `next_action_id`/`missing_fields`/`planning_endpoint`, and correctly excluded the ready one |
| `evaluate_next_action_readiness()` itself, unmodified | **[EXECUTED]** — extracted verbatim from `app/services/next_action_mapper.py` and run standalone against four cases (all-`None`, all-supplied, partially-supplied, no-goal): every result matched the documented contract exactly |
| Both edited production files and the new test file | **[EXECUTED]** — `ast.parse()` succeeded on all three (syntax-valid) |
| Full pytest run of the new file, the existing suite, or the full suite | **[NOT VERIFIED]** — sandbox has no `pytest`/`fastapi`/`sqlmodel` and no network to install them (identical to every prior milestone this session) |

The two `[EXECUTED]` checks above are the strongest verification
available without real dependencies: they run the *actual* production
source text (not a re-description of it) against representative
inputs, including the one case most likely to reveal a bug (a mix of
one ready and one unready NextAction in the same call).

## 6. Regression status

**The minimum viable journey remains fully compatible, unchanged.**
`tests/test_minimum_viable_user_journey.py` uses only the manual
step-by-step endpoints
(`convert-to-project`/`split-into-milestones`/`convert-to-tasks`/
`convert-to-next-action` with `importance`/`energy_required`/
`difficulty` supplied at creation) — none of which were touched by
this step. It was inspected, not edited, per Phase 4's own instruction
("update it only if the public contract genuinely changed") — it
didn't, for this test.

One pre-existing piece of drift, unrelated to this fix, was noticed
but deliberately **not** touched (out of scope — see §8): that test
file's own docstring still says, in the present tense, "there is no
API to set those fields on a NextAction after creation," which was
already false before this milestone (V1-15 added exactly that API)
and remains merely a stale comment, not a behavior — V1-20 first
flagged it, and it is listed again in §8 for a future cleanup pass
rather than bundled into this fix.

## 7. Scope check

Confirmed: no change to the Decision Engine, Planning Graph, Focus
lifecycle, or Learning Loop. No authentication feature, password
recovery, Docker, CI, or database-technology change. No new
dependency. No API renamed. Full diff against the archive as received,
this milestone only:

- `app/api/routes/goals.py` — modified (additive: new import,
  `planning_required` computation in `decompose_goal()`, two new
  fields passed to `DecomposeResponse(...)`)
- `app/schemas/goals.py` — modified (additive: one new schema class,
  two new fields on `DecomposeResponse`)
- `tests/test_decompose_planning_contract.py` — new
- `docs/V1-21-decompose-planning-contract-fix.md` — new (this file)

No other file changed, confirmed by full directory diff against the
original archive.

## 8. Remaining V1-20 issues (not addressed here, by design)

Everything else V1-20 found remains open for a future milestone:

1. No pagination on any list endpoint.
2. Rate limiting covers only `/auth/*` and LLM-invoking routes — the
   entire goals/focus/daily-plan/behavior/user-intelligence surface is
   unlimited.
3. `slowapi`'s limiter is in-process/in-memory — ineffective across
   multiple workers/instances.
4. No API versioning (no `/v1` prefix anywhere).
5. Error message language is inconsistent (mostly Persian, a few
   English strings, default FastAPI/Pydantic 422s always English).
6. `GoalUpdateRequest.horizon` has no validator (asymmetric with
   `GoalCreateRequest.horizon`).
7. No real migration tool; the hand-rolled column-migration list is
   SQLite-only and silently inert on any other database.
8. No Postgres driver in `requirements.txt` despite `config.py`'s own
   comment describing it as a future option.
9. No refresh token / revocation / logout mechanism for JWTs.
10. No password recovery path — `User` has no email field at all.
11. No account-deletion or data-export endpoint.
12. `validate_production_settings()` exists but is never called from
    application startup — dead code, not an enforced safeguard.
13. The structured-logging format string produces invalid JSON
    (`%(message)r` — reproduced by direct execution in V1-20).
14. No request/correlation ID; `/healthz` never checks the database;
    no metrics/APM endpoint.
15. This archive still contains no Dockerfile, no frontend, no CI
    config, and no README — whether these exist elsewhere remains
    unverified.
16. Several infrastructure-level behaviors (security headers, CORS
    rejection, production docs-hiding, rate-limit 429s, the logging
    format) have no test coverage anywhere in the suite.
17. `tests/test_minimum_viable_user_journey.py`'s own docstring
    contains one now-stale factual claim (see §6) — cosmetic, not a
    behavior bug, left for a documentation cleanup pass.

None of these were touched in V1-21, per its own explicit scope.
