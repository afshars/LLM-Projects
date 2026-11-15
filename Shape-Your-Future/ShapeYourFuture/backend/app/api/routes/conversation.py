"""HTTP surface of the AI chat (Coach page, right-hand pane).

  POST /conversation/start      a new empty thread (no LLM call)
  POST /conversation/continue   one user message -> the coach's reply (one LLM call)
  GET  /conversation            the history list: this user's threads that have messages, newest first
  GET  /conversation/{id}       the stored transcript, so a reload redraws the chat

Every route works on the current user only; another user's id is a 404. The chat stores its own messages and nothing
else: it never writes to the daily loop (see services/chat_service.py).
"""
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.api.day import request_day
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.db.models import User
from app.schemas.conversation import (
    ContinueConversationRequest,
    ConversationListResponse,
    ConversationTurnResponse,
    StartConversationRequest,
)
from app.services import chat_service as chat

router = APIRouter(prefix="/conversation", tags=["conversation"])


@router.post("/start", response_model=ConversationTurnResponse)
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
def start(
    request: Request,
    payload: StartConversationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo = chat.start_conversation(db, user.id)
    return ConversationTurnResponse(conversation_id=convo.conversation_id)


@router.post("/continue", response_model=ConversationTurnResponse)
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
def continue_(
    request: Request,
    payload: ContinueConversationRequest,
    target: date = Depends(request_day),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    answer = chat.reply(db, user.id, payload.conversation_id, payload.message, payload.lang, target)
    return ConversationTurnResponse(conversation_id=payload.conversation_id, question_fa=answer)


@router.get("", response_model=ConversationListResponse)
@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")
def list_conversations(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ConversationListResponse(items=chat.list_conversations(db, user.id))


@router.get("/{conversation_id}", response_model=ConversationTurnResponse)
@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")
def get_conversation(
    request: Request,
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ConversationTurnResponse(
        conversation_id=conversation_id,
        messages=chat.get_history(db, user.id, conversation_id),
    )
