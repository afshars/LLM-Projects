"""The user's calendar day: one shared helper (app/api/day.py) for every day-based route.

The clock is pinned by replacing `app.api.day.utc_now`; nothing here depends on the machine's time zone."""
import re
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api import day as day_mod
from app.api.day import local_date, resolve_day

# 00:30 on 11 March 2026 in Tehran (UTC+3:30, no DST in 2026) is 21:00 UTC on 10 March.
TEHRAN_0030 = datetime(2026, 3, 10, 21, 0, tzinfo=timezone.utc)
# 23:30 on 10 March 2026 in Los Angeles (PDT, UTC-7 after the 8 March switch) is 06:30 UTC on 11 March.
LA_2330 = datetime(2026, 3, 11, 6, 30, tzinfo=timezone.utc)


def pin(monkeypatch, moment):
    monkeypatch.setattr(day_mod, "utc_now", lambda: moment)


def test_tehran_half_past_midnight_is_the_local_date_not_the_utc_date():
    assert TEHRAN_0030.date() == date(2026, 3, 10)  # the UTC date: what the old server-side code used
    assert local_date(TEHRAN_0030, "Asia/Tehran") == date(2026, 3, 11)


def test_utc_negative_zone_near_midnight_is_the_local_date_not_the_utc_date():
    assert LA_2330.date() == date(2026, 3, 11)
    assert local_date(LA_2330, "America/Los_Angeles") == date(2026, 3, 10)


def test_unknown_or_missing_zone_falls_back_to_utc():
    assert local_date(TEHRAN_0030, None) == date(2026, 3, 10)
    assert local_date(TEHRAN_0030, "Mars/Olympus") == date(2026, 3, 10)
    assert local_date(TEHRAN_0030, "") == date(2026, 3, 10)


def test_resolve_day_without_day_uses_the_zone(monkeypatch):
    pin(monkeypatch, TEHRAN_0030)
    assert resolve_day(None, "Asia/Tehran") == date(2026, 3, 11)
    assert resolve_day(None) == date(2026, 3, 10)
    pin(monkeypatch, LA_2330)
    assert resolve_day(None, "America/Los_Angeles") == date(2026, 3, 10)


def test_resolve_day_accepts_one_day_either_side_and_rejects_more(monkeypatch):
    pin(monkeypatch, TEHRAN_0030)
    for ok in (date(2026, 3, 10), date(2026, 3, 11), date(2026, 3, 12)):
        assert resolve_day(ok, "Asia/Tehran") == ok
    for bad in (date(2026, 3, 9), date(2026, 3, 13)):
        with pytest.raises(HTTPException) as err:
            resolve_day(bad, "Asia/Tehran")
        assert err.value.status_code == 422


# ---- through the real routes: the bug was an approved tactic landing on yesterday's row ----


def _a_tactic_id():
    from app.llm.tactics import TACTICS  # noqa: PLC0415

    return TACTICS[0].id


@pytest.mark.parametrize(
    "moment, zone, local, utc",
    [
        (TEHRAN_0030, "Asia/Tehran", "2026-03-11", "2026-03-10"),
        (LA_2330, "America/Los_Angeles", "2026-03-10", "2026-03-11"),
    ],
)
def test_confirmed_tactic_lands_on_the_users_local_day(client, auth_headers, monkeypatch, moment, zone, local, utc):
    pin(monkeypatch, moment)
    h = auth_headers | {"X-Timezone": zone}  # no ?day= at all: the server must find the local day itself
    assert client.post("/coach/tactic/confirm", json={"tactic_id": _a_tactic_id()}, headers=h).status_code == 200

    # visible on Coach "today" and in the Today entry, both asked for the local day
    assert client.get("/coach/tactic/today", headers=h).json()["tactic"]["id"] == _a_tactic_id()
    entry = client.get("/daily-entry/today", headers=h).json()
    assert entry["date"] == local and entry["tactic"]["id"] == _a_tactic_id()
    # and the UTC day's row is not the one that got it
    other = client.get(f"/daily-entry/today?day={utc}", headers=h).json()
    assert other["tactic"] is None


def test_today_and_coach_agree_when_the_browser_sends_its_day(client, auth_headers, monkeypatch):
    pin(monkeypatch, TEHRAN_0030)
    h = auth_headers | {"X-Timezone": "Asia/Tehran"}
    assert client.post("/coach/tactic/confirm?day=2026-03-11", json={"tactic_id": _a_tactic_id()}, headers=h).status_code == 200
    assert client.get("/coach/tactic/today", headers=h).json()["tactic"] is not None
    assert client.get("/daily-entry/today?day=2026-03-11", headers=h).json()["tactic"] is not None


def test_a_day_two_days_off_in_the_users_zone_is_422(client, auth_headers, monkeypatch):
    pin(monkeypatch, TEHRAN_0030)
    h = auth_headers | {"X-Timezone": "Asia/Tehran"}
    assert client.get("/daily-entry/today?day=2026-03-13", headers=h).status_code == 422
    assert client.get("/coach/tactic/today?day=2026-03-09", headers=h).status_code == 422


def test_no_other_module_reads_the_server_clock_for_a_day():
    """Guard for 'one helper': date.today()/datetime.now()/utcnow()/current_date may only appear in app/api/day.py
    (timestamps such as updated_at and token expiry are not days and live in db/models.py and core/security.py)."""
    app_dir = Path(__file__).resolve().parents[1] / "app"
    allowed = {"api/day.py", "db/models.py", "core/security.py"}
    pattern = re.compile(r"date\.today\(|datetime\.now\(|utcnow\(|current_date|\.today\(\)")
    offenders = [
        str(p.relative_to(app_dir))
        for p in app_dir.rglob("*.py")
        if str(p.relative_to(app_dir)) not in allowed and pattern.search(p.read_text(encoding="utf-8"))
    ]
    assert offenders == []
