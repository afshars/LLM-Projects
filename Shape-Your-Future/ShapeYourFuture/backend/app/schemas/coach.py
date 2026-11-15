"""Bodies of /coach/tactic. The AI only PROPOSES (suggest); nothing is stored until the user confirms."""
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.llm.tactics import Tactic


class TacticSuggestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    obstacle: str = Field(min_length=1, max_length=1000)
    lang: str = "fa"  # only steers the model's pick prompt; the answer carries both languages


class TacticOut(BaseModel):
    """Both languages, so the screen can switch language without asking the server again."""

    id: int
    stage: str
    title_en: str
    title_fa: str
    description_en: str
    description_fa: str


def tactic_to_out(tactic: Tactic) -> "TacticOut":
    return TacticOut(
        id=tactic.id,
        stage=tactic.stage,
        title_en=tactic.title_en,
        title_fa=tactic.title_fa,
        description_en=tactic.desc_en,
        description_fa=tactic.desc_fa,
    )


class TacticSuggestResponse(BaseModel):
    """`tactic` is None when the obstacle was too vague: the client then asks the user to say a bit more."""

    needs_clarification: bool
    blocker_type: Optional[str] = None
    tactic: Optional[TacticOut] = None


class TacticConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tactic_id: int
    blocker_type: Optional[str] = None


class ConfirmedTacticOut(BaseModel):
    """Today's confirmed tactic, or `tactic=None` when the user has not confirmed one."""

    tactic: Optional[TacticOut] = None
    blocker_type: Optional[str] = None
