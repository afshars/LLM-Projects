"""
LangGraph state definitions. Each graph carries only what its own nodes
need - this is the per-graph slice of the shared UserContext described in
the architecture doc (see services/context_builder.py for the full object).
"""
from typing import TypedDict


class ProgressState(TypedDict, total=False):
    user_id: int
    accomplishments_text: str
    blockers_text: str
    lang: str

    blocker_type: str | None
    blocker_confidence: float | None
    needs_clarification: bool

    recommended_stage: str | None
    reason_fa: str | None

    candidate_tactic_ids: list[int]
    recommended_tactic_id: int | None
    tactic_confidence: float | None

    next_action_fa: str | None
    next_action_duration_min: int | None

