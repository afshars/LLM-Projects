"""
Structured-output schemas for the two LLM steps of the Coach tactic suggestion (services/coach_tactics.py).
Each is deliberately tiny: one narrow judgment and a confidence score, never a paragraph of free reasoning.
"""
from pydantic import BaseModel, Field


class BlockerClassification(BaseModel):
    blocker_type: str = Field(description="busy | distracted | energy | external | internal")
    confidence: float = Field(ge=0, le=1)
    evidence_fa: str = Field(description="One short quoted/paraphrased phrase as evidence.")


class TacticPick(BaseModel):
    tactic_id: int
    confidence: float = Field(ge=0, le=1)
