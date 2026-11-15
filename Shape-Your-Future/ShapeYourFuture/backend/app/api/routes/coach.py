"""Coach: ONE tactic for today's obstacle.

  POST /coach/tactic/suggest   the AI proposes one tactic (tactics.py, family from blocker_map.py). Saves NOTHING.
  POST /coach/tactic/confirm   the user explicitly accepts it; only then is it written to the day's DailyEntry.
  GET  /coach/tactic/today     the tactic confirmed that day, if any.

Both day routes take the same optional `day` (the user's calendar day) as /daily-entry; see app/api/day.py.

The model never chooses freely: the blocker type is mapped to a stage deterministically and the model's tactic id is
checked against tactics.find_tactic (the grounding gate). The confirm route re-validates the id, so a client cannot
store anything that is not in the catalogue."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.api.day import request_day
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.db.models import DailyEntry, User, now
from app.services import coach_tactics as pg
from app.llm.blocker_map import BLOCKER_TACTIC_FAMILY
from app.llm.lang import normalize_lang
from app.llm.tactics import Tactic, find_tactic, tactics_for_stage
from app.schemas.coach import (
    tactic_to_out,
    ConfirmedTacticOut,
    TacticConfirmRequest,
    TacticOut,
    TacticSuggestRequest,
    TacticSuggestResponse,
)

router = APIRouter(prefix="/coach/tactic", tags=["coach"])

MIN_CONFIDENCE = 0.6


@router.post("/suggest", response_model=TacticSuggestResponse)
@limiter.limit(f"{settings.rate_limit_per_minute}/minute")
def suggest(request: Request, body: TacticSuggestRequest, user: User = Depends(get_current_user)):
    lang = normalize_lang(body.lang)
    state = {"user_id": user.id, "blockers_text": body.obstacle, "lang": lang}
    state.update(pg.classify_blocker(state))
    blocker = state.get("blocker_type")
    if blocker not in BLOCKER_TACTIC_FAMILY or (state.get("blocker_confidence") or 0) < MIN_CONFIDENCE:
        return TacticSuggestResponse(needs_clarification=True)
    state.update(pg.map_family(state))
    state.update(pg.pick_tactic(state))
    state.update(pg.validate_tactic(state))
    tactic = find_tactic(state["recommended_tactic_id"])
    if tactic is None:  # unreachable after the gate, but never return an ungrounded tactic
        tactic = tactics_for_stage(state["recommended_stage"])[0]
    return TacticSuggestResponse(
        needs_clarification=False,
        blocker_type=blocker,
        tactic=tactic_to_out(tactic),
    )


def _row(db: Session, user: User, day: date):
    return db.exec(select(DailyEntry).where(DailyEntry.user_id == user.id, DailyEntry.entry_date == day)).first()


@router.post("/confirm", response_model=ConfirmedTacticOut)
@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")
def confirm(
    request: Request,
    body: TacticConfirmRequest,
    target: date = Depends(request_day),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tactic = find_tactic(body.tactic_id)
    if tactic is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="unknown tactic")
    blocker = body.blocker_type if body.blocker_type in BLOCKER_TACTIC_FAMILY else None
    for attempt in (1, 2):
        row = _row(db, user, target)
        if row is None:
            row = DailyEntry(user_id=user.id, entry_date=target)
        if row.coach_tactic_id != tactic.id:
            row.coach_tactic_applied = None  # a different tactic: the earlier "applied" answer no longer applies
        row.coach_tactic_id = tactic.id
        row.coach_blocker_type = blocker
        row.updated_at = now()
        db.add(row)
        try:
            db.commit()
            break
        except IntegrityError:  # two quick requests created today's row at once: retry as an update
            db.rollback()
            if attempt == 2:
                raise
    return ConfirmedTacticOut(tactic=tactic_to_out(tactic), blocker_type=blocker)


@router.get("/today", response_model=ConfirmedTacticOut)
@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")
def today(
    request: Request,
    target: date = Depends(request_day),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _row(db, user, target)
    tactic = find_tactic(row.coach_tactic_id) if row and row.coach_tactic_id is not None else None
    if tactic is None:
        return ConfirmedTacticOut()
    return ConfirmedTacticOut(tactic=tactic_to_out(tactic), blocker_type=row.coach_blocker_type)
