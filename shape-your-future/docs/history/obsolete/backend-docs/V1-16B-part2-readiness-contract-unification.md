> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-16B Part 2 — one readiness contract, two consumers

Status: **implemented.**
Scope: make `POST /focus/start` obey the exact same NextAction
planning-readiness decision `GET /daily-plan` already obeys, instead of
running its own, partial, independently-reimplemented check.

## 1. What Part 1 already built (recap, unchanged by Part 2)

`app/services/next_action_mapper.py`:

* `NextActionReadiness` — `missing_fields` (subset of
  `READINESS_REQUIRED_FIELDS = ("importance", "energy_required",
  "difficulty")`, in that canonical order) + `goal_resolved: bool`.
  `.ready`/`.reason` are derived properties, never stored.
* `evaluate_next_action_readiness(next_action, goal)` — the one rule:
  ready iff all three fields are non-`None` **and** `goal is not None`.
* `map_next_action_to_priority_task()` consumes that result as its sole
  accept/reject gate.

Part 2 does not change any of this. It changes who else gets to ask it
the question.

## 2. The gap Part 2 closes

Before this step there were, in effect, **two** readiness rules living
in the codebase:

| | `GET /daily-plan` | `POST /focus/start` |
|---|---|---|
| `importance` checked? | yes (via the mapper) | **no** |
| `energy_required` checked? | yes | yes |
| `difficulty` checked? | yes | yes |
| Goal ancestry checked? | yes | **no** |

`/focus/start`'s own check was:

```python
if next_action.difficulty is None or next_action.energy_required is None:
    raise HTTPException(400, ...)
```

— a second, hand-rolled, incomplete copy of the mapper's rule. A
NextAction with a broken/unreachable Goal ancestor chain (or simply
missing `importance`) could be **rejected** by `/daily-plan` and
**accepted** by `/focus/start` — the same row, disagreeing readiness
answers depending only on which route was asked.
`tests/test_readiness_contract_parity.py::
test_daily_plan_and_focus_start_both_reject_unresolved_goal_ancestry`
is the regression guard for exactly this case.

## 3. What changed

### 3.1 Shared Goal resolver — `app/services/goal_engine.py`

`resolve_goal_for_next_action(db, next_action) -> tuple[Milestone | None, Goal | None]`

Walks `NextAction -> Task -> Milestone -> Project -> Objective -> Goal`
via plain primary-key lookups (`app/db/models.py` declares no SQLModel
relationships to traverse — same reason the pre-existing
`_goal_for_project()` in this file does its own single-step lookup
rather than an ORM relationship). A broken/missing link anywhere in the
chain yields `None` for whichever ancestor(s) sit past that break,
never raises — the same behavior the resolver's previous, private
incarnation already had.

This is a pure **extraction**, not a new algorithm: it is exactly the
body that used to live only inside
`app/orchestrator/daily_flow.py::DailyFlow._resolve_ancestors()`,
moved to a public, importable function so a second caller
(`/focus/start`) can reach it without re-deriving the walk.

### 3.2 `DailyFlow._resolve_ancestors()` — `app/orchestrator/daily_flow.py`

Now a one-line delegation to `goal_engine.resolve_goal_for_next_action()`.
Kept as a method (rather than deleted and inlined at the call site) so
nothing about `_build_priority_tasks()`'s own shape/tests had to change.
Behavior is byte-for-byte identical to before — confirmed by the full
`tests/test_orchestrator.py` and `tests/test_daily_plan_api.py` suites
passing unmodified.

Unused imports (`Task`, `Project`, `Objective` — only needed by the
inlined walk) were removed; `Milestone`/`Goal`/`NextAction` remain
(still used in type hints and elsewhere in the module).

### 3.3 `POST /focus/start` — `app/api/routes/focus.py`

The old partial check is replaced with:

```python
next_action = _get_owned_next_action(db, user, body.task_id)

_, goal = resolve_goal_for_next_action(db, next_action)
readiness = evaluate_next_action_readiness(next_action, goal)
if not readiness.ready:
    raise HTTPException(400, detail=(
        "این Next Action هنوز برای شروع Focus Session آماده نیست "
        f"({readiness.reason})"
    ))
```

Ownership (`_get_owned_next_action` → 404 for missing/foreign, same
helper, unchanged) still runs first, exactly as before. Everything
after the readiness gate — `daily_coach.start_focus_session()`,
`store.create_focus_session()`, the response shape — is untouched.
No SessionResult/FeedbackSignal change, no execution-model change, no
change to `/focus/finish` or `/focus/feedback`.

**Error message:** per V1-15 §7, the old message
("این Next Action هنوز difficulty/energy_required ندارد") was left
alone at that time because rewording it wasn't required for that
step. Part 2 does change it — the check itself changed shape (it now
also covers `importance` and Goal ancestry, neither of which the old
message could honestly describe), so the message is updated to say so
and to embed `readiness.reason` (the same neutral, developer-facing
diagnostic `evaluate_next_action_readiness()` already produces for
every other consumer) rather than inventing a second piece of
user-facing copy per failure mode. Convention preserved: still a plain
Persian string on `HTTPException.detail`, no new structured-error
framework.

### 3.4 `/daily-plan` itself

**Not modified.** It was already an honest, single-consumer of the
mapper's readiness decision (via `DailyFlow._build_priority_tasks()` →
`map_next_action_to_priority_task()` → `evaluate_next_action_readiness()`);
its own gate (`if not result.ranked_tasks: raise 400`) is a
higher-level "did anything come out the other end" check, not a second
readiness rule, and stays exactly as it was.

## 4. Architecture, before vs after

```
Before:

  NextAction -> DailyFlow._resolve_ancestors() (private)
             -> evaluate_next_action_readiness() -> DailyFlow/mapper
  NextAction -> focus.py's own difficulty/energy_required check (partial, no Goal)

After:

  NextAction -> goal_engine.resolve_goal_for_next_action() (shared)
             -> evaluate_next_action_readiness()
                 |-- DailyFlow (via the mapper) -> /daily-plan
                 `-- /focus/start (directly)
```

One resolver, one readiness function, two consumers that can no longer
disagree.

## 5. Test-fixture correction (not a production-contract change)

Several existing tests built their NextAction fixtures with a bare
`task_id=1` and no backing Task/Milestone/Project/Objective/Goal row —
harmless before Part 2 (the test sqlite engine doesn't FK-enforce
`task_id`, and `/focus/start` never resolved ancestry anyway), but
after Part 2 these rows correctly fail the readiness contract's Goal
check. This was a **test-fixture gap**, not a reason to weaken the
contract — corrected by building a real ancestor chain through the
existing, unmodified `goal_engine` helpers (same pattern
`tests/test_daily_plan_api.py::_make_next_action()` already used)
instead:

* `tests/test_focus_api.py` — `_create_next_action()` rewritten to
  build a real chain; added
  `_create_next_action_without_ancestry()` as the deliberate,
  explicit counterpart for the one test that needs an unresolved Goal.
* `tests/test_focus_feedback_api.py` — same rewrite (this file's
  helpers all funnel through `/focus/start`); one test's short
  identity-marker titles (`"اقدام الف"`/`"اقدام ب"`) were expanded to
  valid NextAction text now that they run through
  `convert_task_to_next_action()`'s own `assert_valid_next_action()`
  instead of a raw, unvalidated DB row.
* `tests/test_next_action_planning_update_api.py` —
  `test_updated_next_action_becomes_accepted_by_daily_plan_and_focus_start`
  now builds its NextAction via a new
  `_make_next_action_with_real_ancestry()` helper. This test was
  **already failing before Part 2** (confirmed against the unmodified
  baseline): its `/daily-plan` assertion required real Goal ancestry
  that its own fixture never provided. The other 9 tests in this file
  only exercise `PUT /goals/next-actions/{id}/planning` directly (which
  never reads ancestry) and were left on the bare `task_id=1` fixture,
  unchanged.

No production readiness rule was relaxed to make any of this pass.

## 6. Tests added

* `tests/test_goal_engine.py` — `resolve_goal_for_next_action()` unit
  tests: full chain resolves both ancestors; each possible broken link
  (missing Task/Milestone/Project/Objective/Goal) yields the documented
  partial result; no mutation of inputs; combined with
  `evaluate_next_action_readiness()` to show the two agree.
* `tests/test_focus_api.py` — one rejection test per readiness
  condition (`importance`, `energy_required`, `difficulty`, Goal
  ancestry) plus a test that a rejected `/focus/start` call creates no
  `FocusSession` row at all.
* `tests/test_readiness_contract_parity.py` (new file) — the
  cross-path invariant: for the same NextAction in the same state,
  `/daily-plan` and `/focus/start` agree — both accept a fully-ready
  NextAction, and both reject the same NextAction for each of the four
  individual readiness failures, including the unresolved-Goal case
  that used to split the two routes' answers.

## 7. Known pre-existing failures (unrelated, unchanged by this step)

Confirmed identical on the unmodified baseline before any Part 2 code
was touched — none reference `next_action_mapper.py`, `goal_engine.py`,
`daily_flow.py`, or `focus.py`:

* `tests/test_decision_candidate_adapter.py::test_adapter_module_does_not_redefine_decision_engine_weights`
* `tests/test_orchestrator.py::test_module_has_no_new_db_or_persistence_dependency_for_the_boundary`
  (an `inspect.getsource()` + `ast.parse()` indentation quirk on this
  Python/pytest combination — an environment/tooling issue, not a
  logic failure)
* `tests/test_planning_graph_shadow_decision.py::test_score_candidates_never_calls_rank_candidates_module_function`
* `tests/test_planning_graph_shadow_decision.py::test_decision_id_is_a_fresh_uuid_and_not_in_output`
* `tests/test_planning_graph_shadow_decision.py::test_returned_key_set_is_unchanged`

All five are in Decision Engine / Planning Graph territory, explicitly
out of scope for V1-16B.
