> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# P0-4 — What Should I Do Now — Report

## 1. Existing Recommendation Logic (Phase 0 inspection)

Before writing anything, the codebase was searched for prior work so nothing
below duplicates it:

| Piece | Found | Location |
|---|---|---|
| Task ranking | `rank_tasks()` (Phase 5) | `app/services/priority_engine.py` |
| Highlight task | `DailyFlow._resolve_highlight()` (Step 18A) | `app/orchestrator/daily_flow.py` |
| Daily plan | `generate_daily_plan()` (Phase 5) | `app/services/priority_engine.py` |
| Focus start | `POST /focus/start` (V1-06) | `app/api/routes/focus.py` |
| Current time handling | `now_minutes` convention (`daily_coach.start_execution()`) | `app/services/daily_coach.py` |
| Free-time calculation | `get_available_time()` + busy blocks (P0-1) | `app/services/priority_engine.py`, `app/services/busy_blocks.py` |
| Energy calculation | `_energy_available_in_slot()` / Best-Fit slot (P0-2) | `app/services/priority_engine.py` |
| Frontend state/navigation | `journey` store, `page()`/`el()` helpers | `frontend/src/state/journey.ts`, `frontend/src/lib/` |

**Already implemented when this session started** (found in the uploaded
WIP, not written by this session):

- `priority_engine.recommend_next_action()` — the deterministic decision
  function itself (Phase 1), plus its reason-code helper
  `_next_action_reasons()` (Phase 2). Fully built on the existing P0-1/P0-2
  primitives, no duplication.
- `DailyFlow.recommend_now()` — orchestrator wiring: real busy-block-aware
  free time, real energy, behavioral adaptation, `exclude_task_ids` for
  "Choose another", and an injectable `now_minutes` for testability.

**Missing when this session started, built in this session:**

- Phase 4 tests (none existed for either function above).
- Phase 3 API endpoint (nothing exposed `recommend_now()` over HTTP).
- Phase 3 frontend UI (no "What should I do now?" affordance anywhere).
- This report.

No existing recommendation/ranking/scheduling logic was reimplemented at
any point below.

## 2. Decision Algorithm

`recommend_next_action(now_minutes, free_windows, candidate_tasks, energy,
goals=None, context=None)` — unchanged from what was already in the repo,
verified and now covered by tests:

1. Clips `free_windows` to "real free time" still ahead of `now_minutes`
   (`_free_windows_from()`).
2. Walks `candidate_tasks` — already the exact, unmodified output of
   `rank_tasks()` — in order, and returns the **first** one that clears two
   hard gates:
   - **time_fit**: fits inside a real free window (reuses `_best_fit_slot_index()`,
     the same Best-Fit logic `generate_daily_plan()` itself uses).
   - **energy_fit**: `energy_required <= energy` (plain integer comparison).
3. A blocked task (unmet dependency) is never a candidate.
4. Returns `NextActionRecommendation(task=None, slot=None, reasons=[])` —
   "no suitable action" — when nothing clears both gates or no free time is
   left. Never fabricates a fallback recommendation.

`goals`/`context` are accepted per the requested signature but not read —
every value-side signal (importance/urgency/deadline/goal_alignment) already
lives on each ranked task, so re-deriving it a second time would risk
silently disagreeing with the ranking already handed in.

## 3. API

**New in this session:** `GET /daily-plan/now`
(`app/api/routes/next_action_now.py`, registered in `app/main.py`).

```
GET /daily-plan/now?exclude=<id>,<id>,...
Authorization: Bearer <token>
```

Response (`app/schemas/next_action_now.py: NextActionNowOut`):

```json
{
  "task_id": "12",
  "title": "Complete Python exercise 3",
  "estimated_duration_minutes": 35,
  "energy_level": "Medium",
  "start_time": "09:15",
  "end_time": "09:50",
  "reasons": ["goal_alignment", "time_fit", "energy_fit"]
}
```

- "No suitable action" is an ordinary `200` with every field `null`/`[]` —
  not an error. This is a deliberate, spec-driven choice (Test 6: "no
  available task → clear empty state" is a legitimate outcome, not a
  failure).
- `reasons` stays as plain reason **codes** (`goal_alignment`/`time_fit`/
  `energy_fit`/`urgency`) — turning a code into a sentence is left to the
  frontend, per `recommend_next_action()`'s own docstring. No
  `priority_score`, no `breakdown`, no reasoning trace is ever returned.
- `?exclude=` implements "Choose another" — forwarded as-is to
  `DailyFlow.recommend_now(exclude_task_ids=...)`.
- No separate active-hours readiness gate (unlike `GET /daily-plan`): a user
  who hasn't set active hours already hits that gate the first time they
  load the Daily Plan; this endpoint just reports "nothing fits" instead of
  re-deriving a second copy of the same check.
- "Start Focus" is **not** reimplemented here — the existing
  `POST /focus/start` is reused unchanged.

## 4. Frontend

**New in this session**, in `frontend/src/views/daily-plan.ts`
(+ `frontend/src/api/types.ts`, `client.ts`, `style.css`):

- A single **"What should I do now?"** button, added above the existing
  scheduled-item list on the Daily Plan page (smallest UI necessary — no new
  route/view/step was added to `journey.ts`).
- Clicking it calls `GET /daily-plan/now` and replaces the button with one
  card: title, estimated time, energy (Low/Medium/High), and up to a few
  plain-language reasons (mapped client-side from the reason codes via
  `REASON_LABELS`).
- Three actions on the card:
  - **Start Focus** — calls the exact same `apiClient.startFocus()` +
    `journey.startFocus()` pair the existing scheduled-item cards already
    use. No new execution engine.
  - **Choose another** — re-asks with this task excluded.
  - **Not now** — returns to the plain button.
- No suitable action → a one-line empty state ("Nothing fits right now.
  Enjoy the gap!") with a "Back" button.
- `npx tsc --noEmit` and `vite build` both pass cleanly with no new errors.

## 5. Verified Scenarios

All ten scenarios from the spec's Phase 4 list are covered by automated
tests (see §6):

1. Best task selected — highest-ranked candidate that fits is returned.
2. Task doesn't fit the current free window → skipped, next candidate used.
3. Task energy incompatible → skipped in favor of a lower-scoring but
   energy-compatible task.
4. Urgent task → `urgency` reason code present only above the urgency
   threshold.
5. Goal alignment → `goal_alignment` reason code present only above the
   goal-alignment threshold.
6. No available task → `task_id: null` (API) / `task=None` (function) —
   never a fabricated recommendation.
7. Recommendation never overlaps busy time — verified directly against
   `get_available_time()`'s busy-block output, and via a real `BusyBlock`
   row at the orchestrator/API layer.
8. Start Focus opens the existing Focus flow — reuses
   `apiClient.startFocus()`/`journey.startFocus()` unchanged; not a new
   engine.
9. User can choose another — `exclude`/`exclude_task_ids` tested at all
   three layers (unit, orchestrator, API).
10. No hidden task mutation — asserted directly (inputs compared
    before/after the call) and via a real DB refetch confirming no
    `NextAction` field changed.

## 6. Tests

All added this session; none existed before for either function.

| File | New tests | Covers |
|---|---|---|
| `backend/tests/test_priority_engine.py` | 17 | `recommend_next_action()` decision logic (unit-level, no DB) |
| `backend/tests/test_orchestrator.py` | 8 | `DailyFlow.recommend_now()` wiring (real free time/energy/behavioral adaptation, exclude, no mutation, no wall-clock dependency, never calls the full daily planner) |
| `backend/tests/test_next_action_now_api.py` | 8 | `GET /daily-plan/now` HTTP boundary (auth, empty state, happy path, choose-another, user isolation) |

```
$ pytest backend/tests -q
1500 passed, 4 deselected (pre-existing, unrelated flaky rate-limit timing tests)
```

## 7. Regression

Full existing suite re-run after all changes: **1500 passed**, 0 new
failures. The only 4 failing tests in the repository
(`test_general_api_rate_limiting.py`) were confirmed to fail identically
against the **original, untouched** uploaded project (timing-sensitive
rate-limiter tests, unrelated to P0-4) — not a regression introduced here.

Frontend: `npx tsc --noEmit` clean, `vite build` succeeds.

## 8. Files Modified / Added

**Added:**
- `backend/app/schemas/next_action_now.py`
- `backend/app/api/routes/next_action_now.py`
- `backend/tests/test_next_action_now_api.py`
- `backend/docs/P0-4-what-should-i-do-now-report.md` (this file)

**Modified:**
- `backend/app/main.py` — registered the new router.
- `backend/tests/test_priority_engine.py` — appended P0-4 unit tests.
- `backend/tests/test_orchestrator.py` — appended P0-4 orchestrator tests.
- `frontend/src/api/types.ts` — `NextActionNowOut`, `REASON_LABELS`.
- `frontend/src/api/client.ts` — `getNextActionNow()`.
- `frontend/src/views/daily-plan.ts` — "What should I do now?" widget.
- `frontend/src/style.css` — minimal styling for the new widget.

**Not modified** (found already correct, reused as-is): `priority_engine.py`'s
`recommend_next_action()`/`_next_action_reasons()`/`energy_at()`,
`daily_flow.py`'s `recommend_now()`.

## 9. Limitations

- No behavioral learning beyond what `recommend_now()` already inherits from
  the Daily Plan's own `_apply_behavioral_adaptation()` — nothing new was
  added here (scope guard honored).
- No calendar integration, notifications, autonomous execution, or
  background agents — none were touched (scope guard honored).
- `GET /daily-plan/now` has no dedicated active-hours readiness gate (see
  §3) — this is a deliberate simplification, not an oversight; flagging it
  in case product wants an explicit redirect-to-setup affordance from this
  entry point too, the way `/daily-plan` itself has.
- `energy_level` bands (Low ≤2, Medium =3, High ≥4) are a presentation
  choice made in this session, not specified numerically anywhere upstream;
  easy to retune in `next_action_now.py`'s `_ENERGY_LABELS` if product wants
  different cutoffs.

## 10. Verdict

`P0-4 WHAT SHOULD I DO NOW — VERIFIED`
