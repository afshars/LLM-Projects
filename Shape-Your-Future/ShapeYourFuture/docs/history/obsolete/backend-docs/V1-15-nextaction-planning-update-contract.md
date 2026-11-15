> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-15 — NextAction planning-readiness update contract

Status: **implemented — smallest coherent API added, per V1-14 §7 Option C.**
Scope: how a user legitimately supplies or updates `importance`,
`energy_required`, `difficulty` on an already-persisted `NextAction`,
including one created structural-only by `/decompose`.

## 1. Audit finding (repeats/confirms V1-14, verified again against the
same archive before any code was touched)

* No existing update mechanism could set these fields on a row already
  in the database. The only two constructors
  (`convert_task_to_next_action`, `auto_decompose`) set them once, at
  creation, and only the manual path accepts them at all. The only
  existing mutation route, `PUT /goals/next-actions/{id}/status`, is
  guarded by `SetNextActionStatusRequest` (`done: bool` only) and a
  service function (`complete_next_action`) that touches nothing but
  `status`/`completed_at` — confirmed by
  `test_status_route_cannot_be_used_to_supply_planning_attributes`.
* **Option A did not apply.** Nothing to extend; there was no
  update-capable endpoint at all for this row.
* **Option C applies, not Option B.** There is still no legitimate
  in-engine source for these values (deterministic, no-LLM
  `/decompose`; Path A scores are 0..100, per-attempt, never
  persisted) — inventing one is the "product-contract change" V1-14
  explicitly deferred, and out of scope here. The only honest source
  remains the user.

## 2. Decision: DECISION 2 (minimal production API)

`PUT /goals/next-actions/{id}/planning` — a sibling of the existing
`PUT /goals/next-actions/{id}/status`, same prefix, same ownership
helper (`_get_owned_next_action`), same response model
(`NextActionOut`), same route file. `PUT` because no `PATCH` exists
anywhere in this API (V1-14 §7 already noted this); an all-optional
partial request body plays the same role a `PATCH` would.

**Why a new route, not folding into `/status`:** `/status` is a
one-field transition (`done`) with its own semantics
(`completed_at` side effect); the three planning fields are a
different, independent concern with different validation (1..5) and
no side effects. Keeping them separate matches the file's existing
"each consumer requires exactly the attributes it uses" principle
(V1-14 §3) applied to *routes* as well as *reads*.

## 3. Data ownership (traced per field — same answer for all three)

1. **Defined:** `db/models.py NextAction.{importance,energy_required,difficulty}`
   — unchanged by this step.
2. **Stored:** the `NextAction` row itself. No second table, no
   duplicate source of truth introduced.
3. **Sets it:** now two places — `convert_task_to_next_action` (at
   creation, optional) and `update_next_action_planning` (after
   creation, this step). Both are the same kind of caller-supplied
   value; neither infers or defaults it.
4. **Reads it:** unchanged — `next_action_mapper.map_next_action_to_priority_task`,
   `POST /focus/start`, `GET /daily-plan` (via the mapper).
5. **Updatable:** yes, now, via the new route. Previously no.
6. **Task-specific or NextAction-specific:** NextAction-specific — a
   Task can have several NextActions (V1-14 §5), each independently
   planned.
7. **Valid to change after creation:** yes — nothing downstream caches
   a copy; every consumer reads the live row (mapper is called fresh
   per `/daily-plan`/`/focus/start` request), so there is no staleness
   risk from allowing the change.

## 4. Validation contract

Bounds are the existing `1..5` from `NextAction`/`ConvertTaskToNextActionRequest`
— not re-invented. Enforced once, at the request-schema boundary
(`UpdateNextActionPlanningRequest`, `ge=1, le=5` per field, same as
`ConvertTaskToNextActionRequest`); the service function does not
re-validate range, same division of responsibility as
`convert_task_to_next_action` (schema validates range,
`assert_valid_next_action` validates the unrelated title/duration
rules — there is nothing analogous to re-check here). No
inconsistency found between schema/model/service/mapper/route for
these three fields; none introduced.

**`None` handling (V1-14 §7 Option C, decision (a)):** this route
follows `update_user_profile`'s convention — a field **absent** from
the request body is left untouched; a field **explicitly `null`**
clears it back to "not yet supplied". This is a real, useful
operation here (undoing a wrong planning value without recreating the
row) and matches an existing precedent in the codebase, so it is not
a new invented behavior. `update_goal`'s ignore-`None` convention was
not used, because there is no situation where a caller would send
`{"importance": null}` and mean "leave `importance` as it is" — that
case is already covered by omitting the key.

**(b) Are `done` rows editable?** Yes — no other edit path in this
codebase gates on entity status (`update_goal` does not check
`Goal.status`), and a completed NextAction's planning fields are
still meaningful historical data (e.g. correcting a value entered
before completion). Not blocking this is consistent, not a new
liberty.

**(c) Are title/estimated_minutes also editable here?** No — out of
scope for V1-15 (see V1-14 §7 Option C, decision (c)); doing so would
require re-running `assert_valid_next_action` and is a separate,
undecided product question. This endpoint only ever touches the three
planning fields.

## 5. Ownership / security

Identical to every other by-id route in this file: `_get_owned_next_action`
→ 404 for missing *and* foreign rows, indistinguishable (unchanged
helper, not modified). No authorization was weakened or bypassed;
`user` is a required `Depends(get_current_user)` parameter, same as
every sibling route.

## 6. `/decompose` contract — preserved exactly

`/decompose` still never sets these fields (unchanged;
`test_auto_decompose_never_invents_planning_attributes` and
`test_decompose_endpoint_response_and_tree_show_no_planning_attributes`
still pass unmodified — no template code was touched). What changes
is only what happens *after*: a decomposed NextAction can now become
planning-ready **in place** via the new route —

* its id is unchanged (no delete/recreate — `setattr` + `commit` on
  the same row);
* its ancestry (`task_id`, and everything above it) is unchanged (the
  route never touches `task_id`);
* the previous workaround (V1-14 §6, item 1 — converting a duplicate
  sibling NextAction on the same Task) is no longer the only option,
  but is not removed or deprecated by this change.

## 7. `/daily-plan` and `/focus/start` errors — untouched

Per V1-15 scope control: the 400 messages
("این Next Action هنوز difficulty/energy_required ندارد" /
"هیچ Next Action آماده‌ی برنامه‌ریزی برای امروز پیدا نشد") are
unchanged. Both are readiness-gate rejections (mapper filtering /
route-level pre-check), not schema validation, and improving their
wording remains a separate, later, small UX/API-contract step — it is
not required for the contract itself to be complete, since a caller
can now query `GET /goals/{id}/tree` to see which fields are `null`
and fix them via the new route.

## 8. Focus completion — untouched

Confirmed unchanged and out of scope, per V1-14 §… (already answered
there): Focus Finish still only transitions the `FocusSession`;
`complete_next_action` (via `PUT .../status`) remains the only path
that marks a `NextAction` `done`. Nothing in this step couples the
two lifecycles.

## 9. Tests added

`tests/test_next_action_planning_update_api.py` —
`test_update_planning_fields_on_owned_next_action`,
`test_planning_update_requires_auth`,
`test_planning_update_rejects_foreign_next_action`,
`test_planning_update_rejects_out_of_range_values`,
`test_planning_update_partial_update_only_touches_given_field`,
`test_planning_update_explicit_null_clears_a_field`,
`test_planning_update_unrelated_fields_are_untouched`,
`test_planning_update_preserves_next_action_id`,
`test_updated_next_action_becomes_accepted_by_daily_plan_and_focus_start`,
`test_decomposed_next_action_becomes_planning_ready_in_place_preserving_id_and_ancestry`.

The last test is the direct regression guard for §6 above — it
decomposes a goal, PUTs planning fields onto one of the resulting
(structural-only) NextActions, and asserts both that its `id`/`task_id`
are unchanged and that `GET /daily-plan` / `POST /focus/start` now
accept it.
