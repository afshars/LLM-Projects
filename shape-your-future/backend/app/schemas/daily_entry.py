"""Request/response bodies of /daily-entry: the daily loop (Highlight, Laser, Energize, Reflect).

Everything is optional on update, so the morning (Highlight/Laser/Energize) and the evening (Reflect) can each send
only what they know. Unknown keys are rejected (422) instead of silently ignored, so a typo never looks like a save."""
import re
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator

from app.schemas.coach import TacticOut

MAX_HIGHLIGHT_LENGTH = 200
MAX_NOTE_LENGTH = 1000
MAX_CHANGE_LENGTH = 500
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _clean_text(value: Optional[str], max_length: int, label: str) -> Optional[str]:
    """Trim; an empty string means "nothing" (None). Too long is an error, never a silent cut."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > max_length:
        raise ValueError(f"{label} must be at most {max_length} characters")
    return value


class LaserChecks(BaseModel):
    """The three distraction defaults of the book. A plain yes/no each: no points."""

    notifications_off: bool = False
    remove_apps: bool = False
    internet_distance: bool = False


class EnergizeChecks(BaseModel):
    """The four daily energy checks of the book. A plain yes/no each: no points, no streaks."""

    walk: bool = False
    real_food: bool = False
    caffeine: bool = False
    rest: bool = False


class DailyEntryOut(BaseModel):
    date: str  # ISO day this entry belongs to
    exists: bool  # False: nothing saved for this day yet (every other field is its empty default)
    highlight: Optional[str] = None
    highlight_done: bool = False
    scheduled_time: Optional[str] = None
    laser: LaserChecks = LaserChecks()
    energize: EnergizeChecks = EnergizeChecks()
    energy: Optional[int] = None
    reflection_note: Optional[str] = None
    change_for_tomorrow: Optional[str] = None
    # The tactic the USER confirmed in Coach for this day (never an unconfirmed AI suggestion) and the user's own
    # answer in Reflect to "did you apply it?" (None = not answered).
    tactic: Optional[TacticOut] = None
    tactic_applied: Optional[bool] = None


class LaserChecksUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notifications_off: Optional[StrictBool] = None  # absent / null = leave as it is
    remove_apps: Optional[StrictBool] = None
    internet_distance: Optional[StrictBool] = None


class EnergizeChecksUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    walk: Optional[StrictBool] = None
    real_food: Optional[StrictBool] = None
    caffeine: Optional[StrictBool] = None
    rest: Optional[StrictBool] = None


class DailyEntryUpdate(BaseModel):
    """PUT /daily-entry/today. A key that is absent is left alone. For the text/time/energy fields an explicit null
    CLEARS the value (the route looks at `model_fields_set`); for yes/no fields null is treated as absent."""

    model_config = ConfigDict(extra="forbid")

    highlight: Optional[str] = None
    highlight_done: Optional[StrictBool] = None
    scheduled_time: Optional[str] = None
    laser: Optional[LaserChecksUpdate] = None
    energize: Optional[EnergizeChecksUpdate] = None
    energy: Optional[StrictInt] = Field(default=None, ge=1, le=10)
    reflection_note: Optional[str] = None
    change_for_tomorrow: Optional[str] = None
    tactic_applied: Optional[StrictBool] = None  # needs a confirmed tactic that day (422 otherwise); null = absent

    @field_validator("highlight")
    @classmethod
    def _highlight(cls, value: Optional[str]) -> Optional[str]:
        return _clean_text(value, MAX_HIGHLIGHT_LENGTH, "highlight")

    @field_validator("reflection_note")
    @classmethod
    def _note(cls, value: Optional[str]) -> Optional[str]:
        return _clean_text(value, MAX_NOTE_LENGTH, "reflection_note")

    @field_validator("change_for_tomorrow")
    @classmethod
    def _change(cls, value: Optional[str]) -> Optional[str]:
        return _clean_text(value, MAX_CHANGE_LENGTH, "change_for_tomorrow")

    @field_validator("scheduled_time")
    @classmethod
    def _time(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if not _TIME_RE.match(value):
            raise ValueError("scheduled_time must be HH:MM (24-hour)")
        return value


class RecentDayOut(BaseModel):
    """One day of the Reflect "last 7 days" strip. `highlight_done` is None when that day had no Highlight, so a
    missing day is never shown as a failed one. Deliberately nothing else: no counts, rates or streaks."""

    date: str
    highlight: Optional[str] = None
    highlight_done: Optional[bool] = None


class RecentOut(BaseModel):
    days: list[RecentDayOut]  # exactly 7, oldest first, ending on the requested day
