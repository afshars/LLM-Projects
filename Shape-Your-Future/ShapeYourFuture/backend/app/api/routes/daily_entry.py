"""The daily loop: one `DailyEntry` per user per day (Highlight, Laser, Energize, Reflect, plus the tactic the user confirmed in Coach).

  GET /daily-entry/today    today's entry (an empty default with exists=false when nothing is saved yet)
  PUT /daily-entry/today    create or update today's entry; only the keys that are sent change
  GET /daily-entry/recent   the last 7 days as Highlight done yes/no (no counts, no streaks)

The browser knows the user's calendar day better than the server, so each route takes an optional `day` (ISO date).
The day is resolved by app/api/day.py (`?day=` or the `X-Timezone` header; one shared helper); a day more than one
day off is 422, so the past cannot be rewritten later. Nothing here is written by the AI: every value comes from the user's own request."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.api.day import request_day
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.database import get_db
from app.db.models import DailyEntry, User, now
from app.llm.tactics import find_tactic
from app.schemas.coach import tactic_to_out
from app.schemas.daily_entry import (
    DailyEntryOut,
    DailyEntryUpdate,
    EnergizeChecks,
    LaserChecks,
    RecentDayOut,
    RecentOut,
)

router = APIRouter(prefix="/daily-entry", tags=["daily-entry"])

RECENT_DAYS = 7
_LASER = ("notifications_off", "remove_apps", "internet_distance")
_ENERGIZE = ("walk", "real_food", "caffeine", "rest")



def _get_row(db: Session, user: User, day: date) -> DailyEntry | None:
    return db.exec(select(DailyEntry).where(DailyEntry.user_id == user.id, DailyEntry.entry_date == day)).first()


def _confirmed_tactic(row: DailyEntry):
    tactic = find_tactic(row.coach_tactic_id) if row.coach_tactic_id is not None else None
    return tactic_to_out(tactic) if tactic else None


def _to_out(day: date, row: DailyEntry | None) -> DailyEntryOut:
    if row is None:
        return DailyEntryOut(date=day.isoformat(), exists=False)
    return DailyEntryOut(
        date=row.entry_date.isoformat(),
        exists=True,
        highlight=row.highlight,
        highlight_done=row.highlight_done,
        scheduled_time=row.scheduled_time,
        laser=LaserChecks(**{k: getattr(row, f"laser_{k}") for k in _LASER}),
        energize=EnergizeChecks(**{k: getattr(row, f"energize_{k}") for k in _ENERGIZE}),
        energy=row.energy,
        reflection_note=row.reflection_note,
        change_for_tomorrow=row.change_for_tomorrow,
        tactic=_confirmed_tactic(row),
        tactic_applied=row.coach_tactic_applied if _confirmed_tactic(row) else None,
    )


def _apply(row: DailyEntry, body: DailyEntryUpdate) -> None:
    sent = body.model_fields_set
    for field in ("highlight", "scheduled_time", "energy", "reflection_note", "change_for_tomorrow"):
        if field in sent:  # an explicit null clears the value
            setattr(row, field, getattr(body, field))
    if body.tactic_applied is not None:
        if _confirmed_tactic(row) is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="tactic_applied needs a confirmed tactic that day")
        row.coach_tactic_applied = body.tactic_applied
    if body.highlight_done is not None:
        row.highlight_done = body.highlight_done
    if body.laser is not None:
        for key in _LASER:
            value = getattr(body.laser, key)
            if value is not None:
                setattr(row, f"laser_{key}", value)
    if body.energize is not None:
        for key in _ENERGIZE:
            value = getattr(body.energize, key)
            if value is not None:
                setattr(row, f"energize_{key}", value)

    if row.highlight is None:
        # Without a Highlight there is nothing to schedule or to have finished.
        if body.highlight_done is True or body.scheduled_time is not None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, detail="highlight_done and scheduled_time need a highlight"
            )
        row.highlight_done = False
        row.scheduled_time = None
    row.updated_at = now()


@router.get("/today", response_model=DailyEntryOut)
@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")
def get_today(
    request: Request,
    target: date = Depends(request_day),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_out(target, _get_row(db, user, target))


@router.put("/today", response_model=DailyEntryOut)
@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")
def put_today(
    request: Request,
    body: DailyEntryUpdate,
    target: date = Depends(request_day),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for attempt in (1, 2):
        row = _get_row(db, user, target)
        if row is None:
            row = DailyEntry(user_id=user.id, entry_date=target)
        try:
            _apply(row, body)
        except HTTPException:
            db.rollback()  # never leave a half-applied update on a session that may be reused
            raise
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # Two first saves of the same day raced: the unique constraint let one win. Retry once as an update.
            db.rollback()
            if attempt == 2:
                raise
            continue
        db.refresh(row)
        return _to_out(target, row)


@router.get("/recent", response_model=RecentOut)
@limiter.limit(f"{settings.general_rate_limit_per_minute}/minute")
def get_recent(
    request: Request,
    target: date = Depends(request_day),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    last = target
    first = last - timedelta(days=RECENT_DAYS - 1)
    rows = db.exec(
        select(DailyEntry).where(DailyEntry.user_id == user.id, DailyEntry.entry_date >= first, DailyEntry.entry_date <= last)
    ).all()
    by_day = {r.entry_date: r for r in rows}
    days = []
    for offset in range(RECENT_DAYS):
        d = first + timedelta(days=offset)
        row = by_day.get(d)
        has_highlight = row is not None and row.highlight is not None
        days.append(
            RecentDayOut(
                date=d.isoformat(),
                highlight=row.highlight if has_highlight else None,
                highlight_done=row.highlight_done if has_highlight else None,
            )
        )
    return RecentOut(days=days)
