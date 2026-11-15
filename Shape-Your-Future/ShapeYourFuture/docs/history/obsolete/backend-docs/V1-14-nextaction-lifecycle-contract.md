> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-14 — NextAction lifecycle & planning-readiness contract

Status: **audit result, no production code changed.**
Scope: how a `NextAction` is created, what "ready" means to each consumer,
and where the missing planning attributes are (and are not) supplied.
References are to function names, not line numbers, so they survive edits.

## 1. Two concepts the code already separates

| Concept | Meaning | Where it is defined / enforced |
|---|---|---|
| **Structural validity** | A valid persisted row: owner, parent Task, a title that passed `validate_next_action()`, `estimated_minutes` 1..180. | `db/models.NextAction`; `goal_engine.assert_valid_next_action`; `ConvertTaskToNextActionRequest` |
| **Planning readiness** | Additionally has `importance`, `energy_required`, `difficulty` (1..5) so the planning pipeline can rank and schedule it. | `next_action_mapper.map_next_action_to_priority_task` (returns `None` otherwise); `GET /daily-plan` gate 2; `POST /focus/start` |

The separation is explicit in the code, not inferred: the model comment says
"any row created before a value is confirmed, simply have none yet; nothing
here ever invents a default like 3"; `/daily-plan` calls the unready state
"valid, owned, but not yet ready" and answers `400 "no planning-ready
NextAction found"`. **This architecture is preserved. Do not make every
persisted NextAction planning-ready.**

## 2. Lifecycle

**Creation — exactly two production constructors.**

| Path | Sets planning fields? | Validation |
|---|---|---|
| `POST /goals/tasks/{id}/convert-to-next-action` → `goal_engine.convert_task_to_next_action` | Yes, **optionally**, exactly as supplied; omitted stays `None` | request schema (1..5, 1..180); `assert_valid_next_action` → 400 |
| `POST /goals/{id}/decompose` → `goal_engine.auto_decompose` | **Never.** Templates (`_MilestoneTemplate`) carry no such data | `assert_valid_next_action` on template text |

**Required to create:** `user_id`, `task_id`, `title`, `estimated_minutes`.
**Optional / nullable:** `scheduled_for`, `importance`, `energy_required`, `difficulty`.
`status` defaults to `pending`.

**Mutation after creation — `status`/`completed_at` only**, via
`PUT /goals/next-actions/{id}/status`. Title, minutes, `scheduled_for` and the
three planning fields are immutable; there is no NextAction delete route
(only the hard-delete cascade of the parent Goal). Focus Finish/Feedback do
**not** mark a NextAction done (only the status route calls
`complete_next_action`); a finished-focus NextAction stays `pending` and is
eligible to be planned again.

**Ownership:** `NextAction.user_id` (denormalized). `_get_owned_next_action`
→ 404 for missing *and* foreign rows (indistinguishable). Reused by
`focus.py` and `chains.py`.

## 3. What each consumer requires

| Consumer | Requires |
|---|---|
| Goal tree / progress / status | Structural validity only |
| Path A `POST /chains/plan/confirm` (highlight identity) | Owned row only (`_resolve_confirmed_highlight_next_action`) |
| `POST /focus/start` | `difficulty` and `energy_required` (not `importance`) |
| DailyFlow → `/daily-plan` | `status == "pending"` (caller filter) **and** `importance`, `energy_required`, `difficulty` **and** a resolvable ancestor Goal (mapper); user has `active_hours` (route gate 1) |

Each consumer requires exactly the attributes it uses (`importance` is a
"value" attribute used for ranking; `energy_required`/`difficulty` are
"constraint" attributes used for scheduling/focus — see `priority_engine`
module docstring). This is principled, not inconsistent; do not unify the
gates. Mapper-skipped NextActions are dropped silently inside DailyFlow by
design; `/daily-plan` does not report which were skipped (deliberately not
exposed in V1 — see `schemas/daily_plan.py`).

## 4. `POST /goals/{id}/decompose` contract

It promises: *the structural hierarchy in one call* (Objective → Project →
Milestones → Tasks → one NextAction per Task, deterministic templates, no
LLM), each NextAction **structurally valid** and un-scheduled. It does **not**
promise planning readiness — nothing in its docstrings, schema or tests says
so, and `DecomposeResponse.next_actions` visibly returns the three fields as
`null`. The model/schema comments imply the attributes arrive "when
confirmed", but **no API exists for an existing row to receive them**, so the
"later" half of that intent is currently unspecified.

## 5. The manual `convert-to-next-action` contract

It is the only place planning attributes enter the system. Fields are
persisted as given, validated 1..5 at the request boundary, and are
**individually optional** — so this endpoint yields a plannable NextAction
only if the caller supplies all three. It works on any owned Task,
including one created by `/decompose` (a Task legitimately has many
NextActions). This is the current planning-readiness boundary.

## 6. Decision (V1)

**Keep the two-stage lifecycle (Option A).** The minimum viable journey is
complete and proven through it (`test_minimum_viable_user_journey.py`).
`/decompose` is a structural convenience whose NextActions are not
plannable; it fails honestly (400s) rather than fabricating a plan.

Known limitations of this choice (documented, not defects blocking V1):

1. A decomposed NextAction cannot be made plannable in place. The workaround
   (convert on the same Task) leaves the original as an unready `pending`
   sibling that counts in `/progress` and can only be left pending or
   manually marked done — it cannot be edited or deleted.
2. The errors don't say how to fix it. `/focus/start` says the NextAction
   does not have difficulty/energy_required "yet" ("هنوز"); `/daily-plan`
   says no planning-ready NextAction was found. Neither names the missing
   field(s) or a way to supply them (the client can only see the `null`s in
   `GET /goals/{id}/tree`).

## 7. Deferred options — what a later version must decide

**Option B (make `/decompose` planning-ready).** There is no legitimate
in-engine source today: templates hold no such data, `/decompose` takes no
body, the engine is deterministic/no-LLM by design, and Path A's LLM scores
are 0..100, per-attempt and never persisted onto NextAction. B therefore
needs a *new input* (user-supplied attributes) or a *new LLM-propose +
user-confirm step* — a product-contract change, not a small fix. Defaults
are forbidden.

**Option C (edit API).** Existing conventions to follow: `PUT` (no `PATCH`
exists anywhere), an all-optional partial request schema, `_get_owned_*`
ownership → 404, a service function in `goal_engine`, `NextActionOut`
response, and a sibling sub-resource of the existing `/status` route (e.g.
`PUT /goals/next-actions/{id}/planning`). Bounds must match
`ConvertTaskToNextActionRequest` (1..5). Decisions to make first: (a) `None`
handling — the code has two conventions (`update_goal` ignores `None`, so it
cannot clear; `update_user_profile`/`update_energy_profile` honour explicit
null via `exclude_unset`); (b) whether `done` rows are editable; (c) whether
title/minutes are also editable (would require re-running
`validate_next_action`).

## 8. Guard tests added in V1-14

`tests/test_next_action_planning_readiness_contract.py` pins, for every
decomposition template and via HTTP: `/decompose` never invents planning
attributes; decompose-only hierarchies get honest 400s from `/daily-plan`
and `/focus/start`; the status route cannot smuggle the fields in; and a
manual NextAction under a decomposed Task is planned while its unready
siblings are not. Verified by mutation: injecting `importance=3, ...` into
`auto_decompose` left the entire pre-existing suite green and fails all 11
new tests.
