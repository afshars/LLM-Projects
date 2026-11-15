> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-17 — Focus → NextAction lifecycle audit

Status: **audit result, no production code changed.**
Scope: whether `NextAction`, `FocusSession`, `SessionResult`, and
`FeedbackSignal` are, or should become, one connected completion
lifecycle, or three deliberately separate domain objects.

## 1. The question this milestone was asked to answer

The known carry-forward description going into V1-17:

> Focus Finish completes the FocusSession, but does not necessarily
> complete the underlying NextAction. This may cause an execution
> that is reported as completed to leave the underlying NextAction
> pending, which can allow it to reappear in planning.

This is **accurate as a description of current behavior** — confirmed
below by direct inspection, and by a new end-to-end test
(`tests/test_focus_next_action_lifecycle_separation.py::
test_next_action_still_selected_by_daily_plan_after_completed_focus_feedback_cycle`).
The question V1-17 had to answer was not "is this true" but "is this a
bug, an intentional separation, or an undecided gap" (Phase 3 of the
brief).

## 2. What was inspected

Per the brief's Phase 1 list: `app/api/routes/focus.py`,
`app/api/routes/goals.py`, `app/services/goal_engine.py`,
`app/services/daily_coach.py`, `app/orchestrator/daily_flow.py`,
`app/services/learning_loop.py`, `app/services/focus_session_store.py`,
`app/services/focus_feedback.py`, `app/schemas/focus.py`,
`app/db/models.py` (`NextAction`, `FocusSession`), and the existing
test suite (`test_focus_api.py`, `test_focus_feedback_api.py`,
`test_daily_plan_api.py`, `test_plan_execute_feedback_learn_loop.py`,
`test_minimum_viable_user_journey.py`), plus `docs/V1-14-*.md` and
`docs/V1-15-*.md`, which turned out to already answer most of Phase 2's
questions directly.

## 3. The lifecycle as it actually exists in the code

```text
NextAction(pending)
      |
      | POST /focus/start   (ownership + readiness gate only - reads
      |                       NextAction, never writes it)
      v
FocusSession(active)                     <- app/db/models.py: status
      |                                     is "active" | "completed"
      | POST /focus/finish
      |   store.complete_focus_session() - the ONLY thing this route
      |   does: FocusSession.status "active" -> "completed",
      |   FocusSession.completed_at = now(). Does not read, join, or
      |   write NextAction. (app/api/routes/focus.py, app/services/
      |   focus_session_store.py)
      v
FocusSession(completed)
      |
      | POST /focus/feedback
      |   1. store.ensure_focus_feedback_allowed() - lifecycle guard
      |      only (FocusSession.status == "completed", not already
      |      claimed).
      |   2. build_focus_feedback_session_result() - builds a
      |      SessionResult purely from the request body's outcome/
      |      difficulty/energy/distraction and FocusSession.task_id.
      |      Never reads a NextAction row.
      |   3. build_feedback_signal() - SessionResult -> FeedbackSignal,
      |      a pure copy, no lookups.
      |   4. store.claim_focus_feedback() - sets
      |      FocusSession.feedback_submitted_at (a duplicate-submission
      |      marker on FocusSession, not a completion marker on
      |      anything else).
      |   5. behavioral_memory.learn_and_persist() -> learning_loop.
      |      consume_feedback_signal() -> update_behavior_from_
      |      observation() - writes BehavioralLearningState /
      |      MemoryRecord. grep across learning_loop.py finds zero
      |      references to NextAction, NextAction.status, or
      |      complete_next_action.
      v
SessionResult { outcome: completed|partial|interrupted|abandoned, ... }
      v
FeedbackSignal { same outcome, ... }
      v
Behavioral Learning (BehavioralLearningState) - influences a FUTURE
`/daily-plan` call's ranking/adaptation. Never mutates NextAction.
```

Separately, and never joined to the chain above by any production code
path:

```text
NextAction(pending)
      |
      | PUT /goals/next-actions/{id}/status   { "done": true }
      |   engine.complete_next_action(db, action, done=True)
      |     action.status = "done"
      |     action.completed_at = now()
      v
NextAction(done)
```

`engine.complete_next_action()` has exactly one production caller —
`PUT /goals/next-actions/{id}/status` — confirmed by
`grep -rn complete_next_action app/ tests/`. No other route, service,
or orchestrator function sets `NextAction.status`.

## 4. Direct answers to the Phase 2 checklist

* **`SessionResult.outcome` values:** `completed | partial | interrupted
  | abandoned` (`daily_coach.ALL_SESSION_OUTCOMES`). All four are
  reachable through `POST /focus/feedback` (`schemas/focus.py`
  validates against the same tuple).
* **Does "completed" in feedback mean "the NextAction was completed"?**
  No. `focus_feedback.py`'s own module docstring says so explicitly:
  *"`FocusSession.status == "completed"` only records that the user
  pressed finish; it says nothing about whether the task was
  completed, partial, interrupted, or abandoned, so it is never used
  to guess one."* `outcome` is a **user-reported** field on a
  different object (`SessionResult`/`FeedbackSignal`), not a read of
  `NextAction.status` and not a write to it either.
* **Can a FocusSession finish successfully while its NextAction stays
  incomplete?** Yes, always — `/focus/finish` never inspects or
  changes `NextAction` at all (§3 above).
* **Can a user run multiple FocusSessions against the same
  NextAction?** Yes. Nothing in `focus_session_store.py` or
  `focus.py` limits `FocusSession` rows per `task_id`; each
  `/focus/start` call creates a new row. Not V1-17 scope to change.
* **Is the `/status` route intended to remain the authoritative
  completion mechanism?** Yes — it is the only one that exists, it is
  documented as such in V1-14 §2 ("Mutation after creation —
  `status`/`completed_at` only, via `PUT /goals/next-actions/{id}/status`")
  and reconfirmed, unchanged, in V1-15 §8.
* **Does Daily Plan exclude completed NextActions based only on
  status?** Yes — `DailyFlow._build_priority_tasks()` queries
  `NextAction.status == "pending"` directly
  (`app/orchestrator/daily_flow.py`); a `NextAction` row's `status`
  field is the only signal used for this filter — no completion is
  ever inferred from FocusSession/SessionResult/FeedbackSignal state,
  and no join to those tables exists in this query.

## 5. Decision: **Option A — intentional separation**

Do not make `Focus Finish -> NextAction completed`, and do not make
`Focus Feedback (outcome=completed) -> NextAction completed`.

This was not a close call. Repository evidence:

1. **It is already written down as intentional, twice, at two prior
   milestones.** V1-14 §2: *"Focus Finish/Feedback do **not** mark a
   NextAction done (only the status route calls `complete_next_action`);
   a finished-focus NextAction stays `pending` and is eligible to be
   planned again."* V1-15 §8, re-auditing the same question one
   milestone later, before touching any code: *"Confirmed unchanged
   and out of scope ... Nothing in this step couples the two
   lifecycles."* V1-17 is a third, independent confirmation of the
   same fact.
2. **The existing test suite already structurally depends on this
   staying true.** `test_plan_execute_feedback_learn_loop.py::
   test_full_plan_execute_feedback_learn_adapt_replan_loop` runs three
   real `/focus/start -> /focus/finish -> /focus/feedback` cycles
   (outcome `"abandoned"`) and then asserts a *second* `/daily-plan`
   call still adapts scheduling for those *same, still-pending*
   NextActions (comment: *"proving ADAPT really feeds into the next
   real planning run"*). If Focus Finish/Feedback completed the
   NextAction, this already-passing V1-12 test would break, since
   there would be nothing left to re-plan.
3. **`daily_coach.py`'s own module comments describe this as a
   structural boundary, not an oversight** — `SessionResult`/
   `FeedbackSignal` are built from `ActiveFocusSession`/`FocusSession`
   only, "carries no inference ... calls no scheduler", and
   `focus_feedback.py` spells out *why* each field that could tempt an
   implicit NextAction write (`actual_duration_minutes`,
   `applied_adaptation_attributions`) is deliberately left `None`/`[]`
   rather than estimated. The same "don't invent what wasn't actually
   observed" principle governs NextAction completion: a user pressing
   *finish* and reporting *completed* is real evidence about the
   *session*, not a machine-verifiable fact about the *NextAction*
   (a NextAction can legitimately need several sessions; see §4).
4. **No evidence points the other way.** No route, schema, service, or
   test comment anywhere in the repository suggests the two were ever
   meant to merge; the only two Options V1-14/V1-15 ever discussed for
   NextAction completion are "the existing `/status` route" (kept) and
   "a new edit API for planning fields" (already built, V1-15) — never
   "derive completion from Focus/Feedback."

**What was missing was not the contract but a regression test for it,
and an explicit answer to the one variant no earlier milestone drove
end-to-end: an outcome of literally `"completed"`.** Both are added by
`tests/test_focus_next_action_lifecycle_separation.py` (§6).

## 6. Tests added

`tests/test_focus_next_action_lifecycle_separation.py`:

* `test_focus_cycle_leaves_next_action_pending_for_every_outcome` — a
  full `/focus/start -> /focus/finish -> /focus/feedback` cycle, for
  every value in `ALL_SESSION_OUTCOMES` (`completed`, `partial`,
  `interrupted`, `abandoned`), leaves `NextAction.status == "pending"`
  and `completed_at is None`.
* `test_focus_feedback_completed_outcome_specifically_does_not_complete_next_action` —
  isolates the `outcome="completed"` case by name, since it is the one
  a caller might most plausibly assume auto-completes the NextAction.
* `test_focus_finish_alone_does_not_mutate_owning_next_action_row` —
  compares every field of the NextAction row (not just `status`)
  before and after `/focus/finish`, with no feedback submitted at all.
* `test_next_action_still_selected_by_daily_plan_after_completed_focus_feedback_cycle` —
  the literal "reappears in planning" scenario from the brief, proven
  through the real HTTP surface (`/focus/*` then `GET /daily-plan`),
  not asserted from code reading alone.
* `test_explicit_status_route_is_what_actually_removes_it_from_daily_plan` —
  the other half: `PUT /goals/next-actions/{id}/status` is confirmed to
  be a real, working way to remove a NextAction from `/daily-plan`,
  so the "separation" is a deliberate two-mechanism design, not a
  missing feature with no workaround.

No existing test was modified. No production file was changed.

## 7. Scope discipline

Per the brief's restrictions, this step did not touch: Decision
Engine, Planning Graph, FeedbackSignal/LearningObservation/
BehavioralLearningState shapes, V1-16B readiness logic,
`/goals/{id}/decompose`, frontend, or auth. The five pre-existing
Decision Engine / Planning Graph failures (unchanged since V1-16B) are
untouched and out of scope here as well; see §8.

## 8. Verdict

**V1-17: PASS (Option A — intentional separation, confirmed; no
production change; regression tests added).**

## 9. Known limitation / possible follow-up (not undertaken here)

The brief's Option B path remains available for a *future* milestone
if product intent changes: an explicit, opt-in transition (e.g. a
request flag on `/focus/feedback`, or a client calling
`/focus/feedback` followed by its own explicit
`PUT .../status {"done": true}`) rather than an implicit one. Nothing
in this audit recommends that change — it would require a new product
decision about which outcome value(s) should qualify and whether a
NextAction can legitimately need more than one session (§4 above
confirms today's code already allows that), which V1-17 was
explicitly told not to invent.
