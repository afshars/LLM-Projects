"""
Data layer: four tables.

  user              the account (username, password hash, display name)
  dailyentry        one row per user per calendar day: the whole Highlight / Laser / Energize / Reflect loop
  chatconversation  one row per AI chat thread of a user (Coach page, right-hand pane)
  chatmessage       the messages of those threads (role + text). Nothing else: the chat never writes to dailyentry

Everything else the app used to store (goals, tasks, focus sessions, behaviour memory, ...) was removed in the
simplification; see backend/scripts/legacy_tables.py for what to do with those tables in an old database.
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=now)

    # Profile (see app/api/routes/profile.py) - display_name/bio start
    # unset (falls back to the username in the API response); avatar
    # defaults to the first built-in preset.
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_kind: str = "preset"
    avatar_value: str = "fox"


class DailyEntry(SQLModel, table=True):
    """The whole daily loop of one user for one calendar day (Make Time: Highlight, Laser, Energize, Reflect).

    One row per (user, day): the unique constraint is what makes "upsert today" safe under two quick requests.
    Plain columns on purpose, no JSON blobs: the three Laser defaults and the four Energize checks are fixed by the
    book, so each is a boolean. There is no score, streak or counter anywhere in this table."""

    __table_args__ = (UniqueConstraint("user_id", "entry_date", name="uq_dailyentry_user_date"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    entry_date: date = Field(index=True)

    # Highlight: ONE priority for the day, optionally scheduled ("HH:MM", 24h).
    highlight: Optional[str] = None
    highlight_done: bool = False
    scheduled_time: Optional[str] = None

    # Laser: break the distraction defaults.
    laser_notifications_off: bool = False
    laser_remove_apps: bool = False
    laser_internet_distance: bool = False

    # Energize: four daily checks.
    energize_walk: bool = False
    energize_real_food: bool = False
    energize_caffeine: bool = False
    energize_rest: bool = False

    # Reflect: energy 1-10, a free note, and what to change tomorrow.
    energy: Optional[int] = None
    reflection_note: Optional[str] = None
    change_for_tomorrow: Optional[str] = None

    # Coach: the ONE tactic the user explicitly confirmed for today's obstacle. Only ever written by
    # POST /coach/tactic/confirm; the AI suggestion itself is never stored.
    coach_tactic_id: Optional[int] = None
    coach_blocker_type: Optional[str] = None
    # The user's own answer in Reflect: did I apply today's tactic? None = not answered yet. Never set by the AI.
    coach_tactic_applied: Optional[bool] = None

    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class ChatConversation(SQLModel, table=True):
    """One AI chat thread. `conversation_id` is the public opaque id the client holds (never the numeric `id`)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: str = Field(index=True, unique=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class ChatMessage(SQLModel, table=True):
    """One message of a chat thread. `role` is "user" or "assistant". Plain text only: no plans, no structured data."""

    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: str = Field(index=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    role: str
    content: str
    created_at: datetime = Field(default_factory=now)
