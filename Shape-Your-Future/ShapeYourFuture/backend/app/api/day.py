"""The calendar day a request is about: the ONE place that turns "now" into a user-facing date.

Every route that reads or writes a per-day row (/daily-entry/*, /coach/tactic/confirm|today) goes through
`resolve_day`; no other module may call date.today() / datetime.now() to pick a day (tests/test_day_helper.py greps
for that).

The user's calendar day comes from the browser, in two ways:
  * `?day=YYYY-MM-DD` - the browser's own local date (the usual case);
  * `X-Timezone: <IANA name>` (e.g. Asia/Tehran) - lets the server compute the local date when `day` is absent.
With neither, the server's UTC date is the fallback. A `day` more than one day away from the user's local date (or
the UTC date when no time zone is sent) is a 422, so the past cannot be rewritten later."""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Header, HTTPException, Query, status

_DAY_ERROR = "day must be today (within one day of the server date)"


def utc_now() -> datetime:
    """The only server clock read for day logic. Tests replace it to pin the moment."""
    return datetime.now(timezone.utc)


def local_date(moment: datetime, tz_name: str | None) -> date:
    """The calendar date of `moment` in the IANA zone `tz_name`; UTC when the name is missing or unknown."""
    if tz_name:
        try:
            return moment.astimezone(ZoneInfo(tz_name)).date()
        except (ZoneInfoNotFoundError, ValueError, OSError):
            pass
    return moment.astimezone(timezone.utc).date()


def resolve_day(day: date | None, tz_name: str | None = None) -> date:
    today = local_date(utc_now(), tz_name)
    if day is None:
        return today
    if abs((day - today).days) > 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=_DAY_ERROR)
    return day


def request_day(
    day: date | None = Query(default=None),
    x_timezone: str | None = Header(default=None, max_length=64),
) -> date:
    """FastAPI dependency: `target = Depends(request_day)` gives the user's calendar day for this request."""
    return resolve_day(day, x_timezone)
