"""Bodies of /conversation: the AI chat of the Coach page.

The response keeps the shape the screen already knows (`ConversationTurnResponse`), so the chat view needs no
special case: `question_fa` carries the assistant's reply (the name is historical; the text follows `lang`).
The state fields (`current_topic`, `known_information`, ...) are fixed empty values: this chat is a plain conversation
and keeps no extracted profile. There is no plan in a turn: the chat never creates or changes anything in the daily loop.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_MESSAGE_LENGTH = 2000  # the screen's composer uses the same number


class StartConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lang: str = Field(default="fa", max_length=8)


class ContinueConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    lang: str = Field(default="fa", max_length=8)


class ChatHistoryMessage(BaseModel):
    """One stored message, returned by GET /conversation/{id} (oldest first)."""

    role: Literal["user", "assistant"]
    content: str
    at: str | None = None  # ISO datetime


class ConversationSummary(BaseModel):
    """One row of GET /conversation (the history list)."""

    conversation_id: str
    title: str  # the first thing the user said, trimmed; never empty
    updated_at: str  # ISO datetime of the last message
    message_count: int


class ConversationListResponse(BaseModel):
    items: list[ConversationSummary] = Field(default_factory=list)


class ConversationTurnResponse(BaseModel):
    conversation_id: str
    question_fa: str | None = None  # the assistant's reply (null on start and on GET)
    done: bool = False
    current_topic: str | None = None
    detected_intent: str | None = None
    conversation_stage: str = "discovery"
    known_information: dict[str, dict[str, str]] = Field(default_factory=dict)
    missing_information: list[str] = Field(default_factory=list)
    # GET /conversation/{id} only: the stored transcript, oldest first (null on start / continue).
    messages: list[ChatHistoryMessage] | None = None
