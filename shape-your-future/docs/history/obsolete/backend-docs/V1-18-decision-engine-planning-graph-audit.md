> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-18 — Decision Engine / Planning Graph failure audit

Status: **audit result; test-only corrections; no production code
changed.**
Scope: determine whether the five pre-existing failures carried
forward since before V1-16B are real production regressions, stale
tests, tooling artifacts, or genuine contract ambiguity - and fix only
what the evidence justifies.

## 1. Baseline

**pytest could not be executed in this environment.** `pip`/`apt`
package installation is network-blocked here (`pip install fastapi` →
`403 Forbidden` from the egress proxy; `apt-get install
python3-fastapi` → `403 Forbidden` from `archive.ubuntu.com`), so
`fastapi`/`sqlmodel`/`pytest` etc. (`requirements.txt`) could not be
installed and the suite could not be run. This matches V1-17's own
documented constraint in this same environment.

Per the brief's own instruction for this case, the audit below was
performed entirely through **source inspection and isolated,
dependency-free Python checks** — every claim about a failure's actual
mechanism was reproduced with a standalone script using only the
standard library (`ast`, `inspect`-equivalent string extraction,
`textwrap`), run directly against the real file contents in this
archive, not asserted from reading code alone. No pytest numbers are
claimed anywhere in this document.

The five failures audited (unchanged since before V1-16B, per that
milestone's own doc §7 and V1-17's carry-forward):

1. `test_decision_candidate_adapter.py::test_adapter_module_does_not_redefine_decision_engine_weights`
2. `test_orchestrator.py::test_module_has_no_new_db_or_persistence_dependency_for_the_boundary`
3. `test_planning_graph_shadow_decision.py::test_score_candidates_never_calls_rank_candidates_module_function`
4. `test_planning_graph_shadow_decision.py::test_decision_id_is_a_fresh_uuid_and_not_in_output`
5. `test_planning_graph_shadow_decision.py::test_returned_key_set_is_unchanged`

## 2. Failure 1 — `test_adapter_module_does_not_redefine_decision_engine_weights`

**A. What the test asserts:** `app/services/decision_candidate_adapter.py`
must not contain source text that looks like a redefinition of
`IMPORTANCE_WEIGHT`, `URGENCY_WEIGHT`, or `GOAL_ALIGNMENT_WEIGHT` — i.e.
it must read the weights from `decision_engine.py`, never duplicate
them locally.

**B. What production code actually does:** `decision_engine.py` is
still the sole owner (`IMPORTANCE_WEIGHT = 0.5`, `URGENCY_WEIGHT =
0.3`, `GOAL_ALIGNMENT_WEIGHT = 0.2` — unchanged, confirmed by the same
file's own passing
`test_decision_engine_py_is_unaffected_by_the_new_adapter`).
`decision_candidate_adapter.py` only imports and calls
`decision_engine.weighted_score()` (`score = weighted_score(candidate_score)
/ 100`); it defines **zero** module-level `WEIGHT` assignments anywhere.

**C. Was this intentional?** Yes — Step 28G-20D-1's own scope (this
module's docstring) explicitly forbids re-deriving the weights, and
that is exactly what the code does.

**Root cause of the failure:** the module's own docstring, explaining
*why* it doesn't re-derive them, contains the prose sentence
`IMPORTANCE_WEIGHT + URGENCY_WEIGHT + GOAL_ALIGNMENT_WEIGHT == 1.0`.
The test's check, `"GOAL_ALIGNMENT_WEIGHT =" not in source`, is a
substring match — and the `==` comparison operator's first `=`
character makes `"GOAL_ALIGNMENT_WEIGHT ="` a true substring of
`"GOAL_ALIGNMENT_WEIGHT == 1.0"`, even though nothing is being
assigned. Reproduced directly:

```python
>>> forbidden = "GOAL_ALIGNMENT_WEIGHT ="
>>> forbidden in "...IMPORTANCE_WEIGHT + URGENCY_WEIGHT + GOAL_ALIGNMENT_WEIGHT == 1.0..."
True
```

**Classification: TEST/TOOLING ARTIFACT.** Naive source-substring
check tripped by prose, not by code. Production behavior is correct.

**Fix:** the test now excludes the module's own docstring (via
`ast.get_docstring(..., clean=False)` + `str.replace()`, `clean=False`
so the extracted text matches the source verbatim and the replace
actually finds it) before running the same three substring checks.
Verified against the real file: all three now correctly evaluate
`False`. No production change.

## 3. Failure 2 — `test_module_has_no_new_db_or_persistence_dependency_for_the_boundary`

**A. What the test asserts:**
`DailyFlow._build_adaptation_effectiveness_context()` must call none
of `save_behavioral_learning_state`, `load_behavioral_learning_state`,
`commit`, `add`, or `get_db` — i.e. this boundary introduces no new
persistence dependency.

**B. What production code actually does:** the method's entire body is:

```python
if self.effectiveness_memory is None:
    return None
return build_adaptation_effectiveness_planning_context(
    self.effectiveness_memory
)
```

One call: `build_adaptation_effectiveness_planning_context()`. Zero
persistence calls.

**C. Was this intentional?** Yes — the method's own docstring states it
builds only from `self.effectiveness_memory` "exactly as the caller
supplied it," with "no `db` to read from," matching
`AdaptationEffectivenessMemory`'s documented lack of any persistence
layer.

**Root cause of the failure:** `inspect.getsource()` on a **class
method** (as opposed to a module or a top-level function) returns the
source exactly as it appears in the class body — still indented at
the method's own level (4 spaces here). `ast.parse()` requires
top-level, unindented source; parsing indented text unconditionally
raises `IndentationError: unexpected indent`, reproduced directly
against the real method source:

```python
>>> ast.parse("    def _build_adaptation_effectiveness_context(\n        self,\n    ...")
IndentationError: unexpected indent (<unknown>, line 1)
```

This is a **mechanical property of `inspect.getsource()` on bound
methods** (any Python version, any environment) — not the
Python/pytest-version-specific "quirk" V1-16B's doc guessed it might
be. The sibling test this one's own docstring says it copies the style
of (`test_module_imports_no_db_persistence_planner_scheduler_or_llm`
in `test_adaptation_effectiveness_planning_context.py`) parses
`inspect.getsource(a_whole_module)` instead — module source always
starts at column 0, so it never hit this — and that difference is why
the two "same style" tests behave differently.

**Classification: TEST/TOOLING ARTIFACT.** A source-extraction bug in
the test (missing `textwrap.dedent()`), not a persistence regression.
Reproduced with the actual dedented source, the real call set is
`{'build_adaptation_effectiveness_planning_context'}` — no overlap
with the forbidden set.

**Fix:** added `textwrap.dedent()` around the extracted method source
before `ast.parse()`. Verified against the real method: parses
cleanly, and `calls & forbidden == set()`. No production change.

## 4-6. Failures 3-5 — `test_planning_graph_shadow_decision.py`

### Failure 3 — `test_score_candidates_never_calls_rank_candidates_module_function`

**A. What the test asserts:** `score_candidates()` (`app/graphs/planning_graph.py`)
must not import or call `rank_candidates()` — the Step 28G-20F-14
Authoritative Decision Layer Migration's central claim: `MinimalDecisionEngine`
is now the sole winner-selector, with no fallback to the old
weighted-score ranker.

**B. What production code actually does:** `planning_graph.py`'s
imports include only `margin_confidence` from `decision_engine.py`
(never `rank_candidates`); `score_candidates()`'s body calls
`_validate_candidate_identity()` → `candidate_scores_to_evaluations()`
→ `DecisionContext(...)` → `MinimalDecisionEngine().decide()`. No call
to `rank_candidates` anywhere in the function body.
`hasattr(planning_graph, "rank_candidates")` is `False` — confirmed by
direct inspection of the module's `from ... import` lines.

**C. Was this intentional?** Yes — this is the exact migration
`score_candidates()`'s own docstring documents by name ("There is no
fallback to `rank_candidates()` in this path, and no shadow comparison
against it").

**Root cause of the failure:** that same docstring sentence is the
false-positive source — `"rank_candidates"` appears twice in the
function's own docstring (explaining its absence), which a plain
`"rank_candidates" not in source` substring check cannot distinguish
from an actual call.

**Classification: TEST/TOOLING ARTIFACT** — same class of bug as
Failure 1, in the sibling test file.

**Fix:** identical pattern to Failure 1 — exclude the function's own
docstring (`ast.get_docstring(function_node, clean=False)`) before the
substring check. Verified against the real function source: `False`.
No production change.

### Failures 4 & 5 — `test_decision_id_is_a_fresh_uuid_and_not_in_output`, `test_returned_key_set_is_unchanged`

**A. What the tests assert:** `score_candidates()`'s returned dict
(1) never contains a `"decision_id"` key at all, and (2) has exactly
the key set `{"highlight", "highlight_task_id", "source",
"rank_confidence"}`.

**B. What production code actually does:** `score_candidates()`
generates `decision_id = str(uuid.uuid4())` for `DecisionContext`
(unchanged since Step 28G-20F-17) and — per a comment naming a later
step directly in the return statement — **also returns it**:

```python
return {
    "highlight": decision_result.selected_action,
    "highlight_task_id": decision_result.metadata.get(CANDIDATE_TASK_ID_METADATA_KEY),
    # Step 20F-23: propagate the same decision_id already generated
    # above for DecisionContext - output identity only, no new
    # generation, no change to selection/scoring/metadata.
    "decision_id": decision_id,
    "source": "ranked",
    "rank_confidence": margin_confidence(result.scores),
}
```

**C. Was this intentional?** Yes — confirmed independently in three
places, all under the same step name:

* `app/graphs/state.py` (`PlanningProposeState.decision_id`): *"Step
  20F-23: the same decision_id already generated locally in
  score_candidates() for DecisionContext, propagated as output
  identity only."*
* `app/schemas/chains.py` (`PlanningProposeResponse.decision_id`):
  *"Step 20F-23: the same decision_id score_candidates() already
  generates for DecisionContext, surfaced as output identity only."*
* A **dedicated, currently-intact test file**,
  `tests/test_planning_graph_decision_id_propagation.py`
  ("Step 20F-23 - Surface decision_id through plan_propose"), whose
  own tests assert exactly the opposite of Failures 4/5 —
  `test_scored_path_returns_a_non_empty_decision_id` asserts
  `result["decision_id"]` is a real, present, non-empty UUID string,
  and `test_returned_decision_id_matches_the_one_used_by_decisioncontext`
  confirms it's the same id `DecisionContext` used — the exact fact
  Failure 4 was written, one step earlier, to assert the reverse of.

**Root cause of the failure:** these two tests were written under Step
28G-20F-17 (`decision_id` generated but deliberately not returned,
purely internal to `DecisionContext`) and were never revisited when
Step 20F-23 made it additive output identity one step later — a
genuine, documented, later contract change that these two assertions
were simply never updated to match.

**Classification: STALE TEST** (not a tooling artifact — the check
itself is mechanically sound; the *expectation* it encodes is
obsolete).

**Fix (per the brief's Option A: "update... tests that encode obsolete
contracts... preserve meaningful runtime coverage"):**

* `test_decision_id_is_a_fresh_uuid_and_not_in_output` → renamed
  `test_decision_id_is_a_fresh_uuid_and_matches_output`. The
  freshness/real-UUID-format assertions (its actual, still-valid
  point) are untouched; only the final "not in result" / "not in
  repr(result)" lines are replaced with `result["decision_id"] ==
  decision_id` — the same identity fact, updated to the current
  contract, without duplicating `test_planning_graph_decision_id_propagation.py`'s
  own, more thorough coverage of the same fact (referenced in the
  updated docstring).
* `test_returned_key_set_is_unchanged` → renamed
  `test_returned_key_set_includes_decision_id_and_highlight_task_id`.
  `"decision_id"` added to the expected key set, plus one line
  confirming it's non-empty (detailed UUID validation stays in the
  dedicated file, referenced in a comment rather than re-tested here).
* The section comment `"Decision context / decision id (not exposed)"`
  above these tests, which stated the now-obsolete assumption as fact,
  was corrected to drop the parenthetical.

No production change in either case.

## 7. Contract matrix

| Failure | Test expects | Production does | Intended current contract | Classification |
|---|---|---|---|---|
| 1. `test_adapter_module_does_not_redefine_decision_engine_weights` | No `"WEIGHT ="`-shaped text in the adapter module | Weights defined only in `decision_engine.py`; adapter only imports `weighted_score()` | Single source of truth for weights (unchanged) | TEST/TOOLING ARTIFACT |
| 2. `test_module_has_no_new_db_or_persistence_dependency_for_the_boundary` | No persistence calls in `_build_adaptation_effectiveness_context()` | Calls only `build_adaptation_effectiveness_planning_context()` | No `db`/persistence in this boundary (unchanged) | TEST/TOOLING ARTIFACT |
| 3. `test_score_candidates_never_calls_rank_candidates_module_function` | No `rank_candidates` reference in `score_candidates()` | `rank_candidates` neither imported nor called | `MinimalDecisionEngine` fully authoritative (unchanged since 28G-20F-14) | TEST/TOOLING ARTIFACT |
| 4. `test_decision_id_is_a_fresh_uuid_and_not_in_output` | `decision_id` absent from `score_candidates()`'s result | `decision_id` present, equal to `DecisionContext.decision_id` | `decision_id` is additive output identity (Step 20F-23) | STALE TEST |
| 5. `test_returned_key_set_is_unchanged` | Result key set has 4 keys, no `decision_id` | Result key set has 5 keys, including `decision_id` | Same as above (Step 20F-23) | STALE TEST |

## 8. Decision: Option A — all five are stale/tooling artifacts

Production behavior matches the current, intentional contract in
every case. No production file was changed. Only the five test
functions (across three files) were corrected — three for a
false-positive substring-matching bug, two for an un-synced assertion
against a later, already-documented, already-separately-tested
contract change. Meaningful runtime coverage is preserved in every
case (each fixed test still checks its original real intent; nothing
was deleted).

## 9. Files changed

* `backend/tests/test_decision_candidate_adapter.py` — Failure 1 fix.
* `backend/tests/test_orchestrator.py` — Failure 2 fix.
* `backend/tests/test_planning_graph_shadow_decision.py` — Failures 3,
  4, 5 fixes.

No other file (production or test) was modified. `git diff`-equivalent
confirmed via directory comparison against the archive as received.

## 10. Production changes

None.

## 11. Tests run after changes

**None executed — pytest remained unavailable in this environment**
(§1). Every fix above was instead verified by extracting the exact,
real source text from this archive's files and running the corrected
check logic standalone, with the standard library only, reproducing
both the original failure and the corrected, passing outcome
byte-for-byte against production code as it exists in this repository
(shown inline in §2/§3/§4-6 above). This is not equivalent to a pytest
run — it does not exercise `fake_llm`, fixtures, FastAPI routing,
SQLModel, or any other test's interaction with the file — and should
be confirmed by running `pytest tests/test_decision_candidate_adapter.py
tests/test_orchestrator.py tests/test_planning_graph_shadow_decision.py`
(and then the full suite) in an environment with `requirements.txt`
installed.

## 12. Remaining failures

Unknown without a real pytest run. No failure is expected to newly
appear from this step's changes, since no production file was touched
and every edited test's non-docstring-derived, non-key-set assertions
were left exactly as they were. This should be confirmed, not assumed
— see §11.

## 13. Final V1-18 verdict

**CONDITIONAL PASS** — audit complete, all five failures fully
explained and traced to real code with reproducible evidence,
classification is unambiguous (three tooling artifacts, two stale
assertions), and only test files were touched. Downgraded from PASS
for the same reason as V1-17: the corrected tests are unexecuted in
this sandboxed environment, not confirmed green by a real pytest run.

## 14. Recommended next architectural step

1. **Immediate:** run the full suite in an environment with
   `requirements.txt` installed, to convert this CONDITIONAL PASS into
   a real PASS/NOT PASS with actual numbers - none of V1-16B, V1-17,
   or V1-18's fixes have been executed by pytest at all, only
   traced/reasoned about against static source.
2. Consider hardening the two other, still-passing AST-substring
   tests in `test_decision_candidate_adapter.py`
   (`test_adapter_module_is_not_imported_by_any_off_limits_production_module`)
   the same way, proactively - they use the identical
   `"name" not in inspect.getsource(...)` pattern and are one
   docstring edit away from the same false-positive class this
   milestone fixed twice. Out of scope here (not currently failing;
   V1-18 was told to audit the five known failures, not go looking for
   more), but worth a note for whoever next edits those modules'
   docstrings.
3. No architectural change to Decision Engine, Planning Graph, or
   their integration is indicated - this audit found the migration
   from shadow to authoritative decision-making (Step 28G-20F-14) and
   the later `decision_id` exposure (Step 20F-23) both complete and
   internally consistent, just under-reflected in this one older test
   file.
