"""The daily loop API: GET/PUT /daily-entry/today and GET /daily-entry/recent (one DailyEntry per user per day)."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import select

from app.db.models import DailyEntry, User


def _today():
    return datetime.now(timezone.utc).date()


def _user_id(db, username="testuser"):
    return db.exec(select(User).where(User.username == username)).one().id


def _count(db):
    return len(db.exec(select(DailyEntry)).all())


def _other_headers(client, name="seconduser"):
    client.post("/auth/register", json={"username": name, "password": "Secret.123@"})
    token = client.post("/auth/login", data={"username": name, "password": "Secret.123@"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- auth


@pytest.mark.parametrize("method,path", [("get", "/daily-entry/today"), ("put", "/daily-entry/today"), ("get", "/daily-entry/recent")])
def test_every_route_needs_a_login(client, method, path):
    kwargs = {"json": {}} if method == "put" else {}
    assert getattr(client, method)(path, **kwargs).status_code == 401


# ---------------------------------------------------------------- get today


def test_empty_day_is_an_empty_default_not_a_404(client, test_db, auth_headers):
    res = client.get("/daily-entry/today", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body == {
        "date": _today().isoformat(),
        "exists": False,
        "highlight": None,
        "highlight_done": False,
        "scheduled_time": None,
        "laser": {"notifications_off": False, "remove_apps": False, "internet_distance": False},
        "energize": {"walk": False, "real_food": False, "caffeine": False, "rest": False},
        "energy": None,
        "reflection_note": None,
        "change_for_tomorrow": None,
        "tactic": None,
        "tactic_applied": None,
    }
    assert _count(test_db) == 0  # reading never creates a row


# ---------------------------------------------------------------- upsert


def test_put_creates_then_get_returns_it(client, test_db, auth_headers):
    res = client.put(
        "/daily-entry/today",
        headers=auth_headers,
        json={
            "highlight": "  Write the proposal  ",
            "scheduled_time": "09:30",
            "laser": {"notifications_off": True},
            "energize": {"walk": True, "real_food": True},
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["exists"] is True
    assert body["highlight"] == "Write the proposal"
    assert body["scheduled_time"] == "09:30"
    assert body["laser"] == {"notifications_off": True, "remove_apps": False, "internet_distance": False}
    assert body["energize"] == {"walk": True, "real_food": True, "caffeine": False, "rest": False}
    assert client.get("/daily-entry/today", headers=auth_headers).json() == body
    assert _count(test_db) == 1


def test_second_put_updates_only_the_sent_keys_and_keeps_one_row(client, test_db, auth_headers):
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Plan", "laser": {"remove_apps": True}})
    res = client.put(
        "/daily-entry/today",
        headers=auth_headers,
        json={"highlight_done": True, "energy": 7, "reflection_note": "Calm day", "change_for_tomorrow": "Phone in another room", "laser": {"internet_distance": True}},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["highlight"] == "Plan"  # untouched
    assert body["highlight_done"] is True
    assert body["energy"] == 7
    assert body["reflection_note"] == "Calm day"
    assert body["change_for_tomorrow"] == "Phone in another room"
    assert body["laser"] == {"notifications_off": False, "remove_apps": True, "internet_distance": True}  # merged, not replaced
    assert _count(test_db) == 1


def test_empty_put_creates_an_empty_entry_and_changes_nothing_later(client, test_db, auth_headers):
    assert client.put("/daily-entry/today", headers=auth_headers, json={}).json()["exists"] is True
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Keep me"})
    assert client.put("/daily-entry/today", headers=auth_headers, json={}).json()["highlight"] == "Keep me"
    assert _count(test_db) == 1


def test_explicit_null_clears_and_resets_what_depends_on_the_highlight(client, auth_headers):
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Plan", "scheduled_time": "10:00", "highlight_done": True, "energy": 6})
    res = client.put("/daily-entry/today", headers=auth_headers, json={"highlight": None, "energy": None})
    body = res.json()
    assert body["highlight"] is None
    assert body["highlight_done"] is False
    assert body["scheduled_time"] is None
    assert body["energy"] is None


def test_blank_text_means_nothing(client, auth_headers):
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Plan", "reflection_note": "x"})
    body = client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "   ", "reflection_note": ""}).json()
    assert body["highlight"] is None
    assert body["reflection_note"] is None


def test_scheduled_time_can_be_removed_and_kept_separate_from_the_highlight(client, auth_headers):
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Plan", "scheduled_time": "10:00"})
    body = client.put("/daily-entry/today", headers=auth_headers, json={"scheduled_time": None}).json()
    assert body["scheduled_time"] is None
    assert body["highlight"] == "Plan"


# ---------------------------------------------------------------- validation (422, and nothing is saved)


@pytest.mark.parametrize(
    "payload",
    [
        {"energy": 0},
        {"energy": 11},
        {"energy": "5"},
        {"energy": True},
        {"energy": 5.5},
        {"scheduled_time": "9:30"},
        {"scheduled_time": "24:00"},
        {"scheduled_time": "12:60"},
        {"scheduled_time": "noon"},
        {"highlight": "x" * 201},
        {"reflection_note": "x" * 1001},
        {"change_for_tomorrow": "x" * 501},
        {"highlight_done": "yes"},
        {"laser": {"notifications_off": "yes"}},
        {"laser": {"telepathy": True}},
        {"energize": {"coffee": True}},
        {"points": 10},
        {"streak": 3},
    ],
)
def test_invalid_bodies_are_422_and_save_nothing(client, test_db, auth_headers, payload):
    assert client.put("/daily-entry/today", headers=auth_headers, json=payload).status_code == 422
    assert _count(test_db) == 0


def test_done_or_scheduled_without_a_highlight_is_422(client, test_db, auth_headers):
    assert client.put("/daily-entry/today", headers=auth_headers, json={"highlight_done": True}).status_code == 422
    assert client.put("/daily-entry/today", headers=auth_headers, json={"scheduled_time": "09:00"}).status_code == 422
    assert _count(test_db) == 0
    # ...and a rejected update leaves an existing entry exactly as it was
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Plan", "energy": 4})
    assert client.put("/daily-entry/today", headers=auth_headers, json={"highlight": None, "scheduled_time": "09:00"}).status_code == 422
    body = client.get("/daily-entry/today", headers=auth_headers).json()
    assert body["highlight"] == "Plan" and body["energy"] == 4


def test_highlight_and_done_in_the_same_request_is_fine(client, auth_headers):
    body = client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Plan", "highlight_done": True}).json()
    assert body["highlight_done"] is True


# ---------------------------------------------------------------- the day parameter


def test_day_within_one_day_of_the_server_is_accepted(client, auth_headers):
    tomorrow = (_today() + timedelta(days=1)).isoformat()
    res = client.put(f"/daily-entry/today?day={tomorrow}", headers=auth_headers, json={"highlight": "Far east"})
    assert res.status_code == 200
    assert res.json()["date"] == tomorrow
    assert client.get(f"/daily-entry/today?day={tomorrow}", headers=auth_headers).json()["highlight"] == "Far east"
    assert client.get("/daily-entry/today", headers=auth_headers).json()["exists"] is False  # a different day


@pytest.mark.parametrize("offset", [-5, -2, 2, 30])
def test_far_days_are_rejected_so_the_past_cannot_be_rewritten(client, test_db, auth_headers, offset):
    day = (_today() + timedelta(days=offset)).isoformat()
    assert client.get(f"/daily-entry/today?day={day}", headers=auth_headers).status_code == 422
    assert client.put(f"/daily-entry/today?day={day}", headers=auth_headers, json={"highlight": "x"}).status_code == 422
    assert client.get(f"/daily-entry/recent?day={day}", headers=auth_headers).status_code == 422
    assert _count(test_db) == 0


@pytest.mark.parametrize("bad", ["not-a-date", "2026-13-45", ""])
def test_bad_day_is_422_not_500(client, auth_headers, bad):
    assert client.get(f"/daily-entry/today?day={bad}", headers=auth_headers).status_code == 422


# ---------------------------------------------------------------- isolation


def test_users_never_see_each_others_entries(client, test_db, auth_headers):
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Mine"})
    other = _other_headers(client)
    assert client.get("/daily-entry/today", headers=other).json()["exists"] is False
    client.put("/daily-entry/today", headers=other, json={"highlight": "Theirs"})
    assert client.get("/daily-entry/today", headers=auth_headers).json()["highlight"] == "Mine"
    assert _count(test_db) == 2  # one row per user per day


def test_the_database_itself_refuses_a_second_row_for_the_same_day(test_db, client, auth_headers):
    from sqlalchemy.exc import IntegrityError

    uid = _user_id(test_db)
    test_db.add(DailyEntry(user_id=uid, entry_date=_today()))
    test_db.commit()
    test_db.add(DailyEntry(user_id=uid, entry_date=_today()))
    with pytest.raises(IntegrityError):
        test_db.commit()
    test_db.rollback()


# ---------------------------------------------------------------- recent


def test_recent_is_seven_days_oldest_first_and_empty_days_are_not_failures(client, test_db, auth_headers):
    uid = _user_id(test_db)
    today = _today()
    test_db.add(DailyEntry(user_id=uid, entry_date=today - timedelta(days=1), highlight="Done one", highlight_done=True))
    test_db.add(DailyEntry(user_id=uid, entry_date=today - timedelta(days=2), highlight="Missed one", highlight_done=False))
    test_db.add(DailyEntry(user_id=uid, entry_date=today - timedelta(days=3), energy=5))  # an entry with no highlight
    test_db.add(DailyEntry(user_id=uid, entry_date=today - timedelta(days=9), highlight="Too old", highlight_done=True))
    test_db.commit()
    client.put("/daily-entry/today", headers=auth_headers, json={"highlight": "Today", "highlight_done": True})

    days = client.get("/daily-entry/recent", headers=auth_headers).json()["days"]
    assert [d["date"] for d in days] == [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    by_date = {d["date"]: d for d in days}
    assert by_date[today.isoformat()] == {"date": today.isoformat(), "highlight": "Today", "highlight_done": True}
    one = by_date[(today - timedelta(days=1)).isoformat()]
    assert (one["highlight"], one["highlight_done"]) == ("Done one", True)
    two = by_date[(today - timedelta(days=2)).isoformat()]
    assert (two["highlight"], two["highlight_done"]) == ("Missed one", False)
    for offset in (3, 4, 5, 6):  # no highlight that day: unknown, not "no"
        d = by_date[(today - timedelta(days=offset)).isoformat()]
        assert (d["highlight"], d["highlight_done"]) == (None, None)
    assert "Too old" not in str(days)


def test_recent_has_no_stats_streaks_or_scores(client, auth_headers):
    body = client.get("/daily-entry/recent", headers=auth_headers).json()
    assert set(body) == {"days"}
    assert len(body["days"]) == 7
    for d in body["days"]:
        assert set(d) == {"date", "highlight", "highlight_done"}


def test_recent_only_contains_my_days(client, test_db, auth_headers):
    other = _other_headers(client)
    client.put("/daily-entry/today", headers=other, json={"highlight": "Theirs", "highlight_done": True})
    days = client.get("/daily-entry/recent", headers=auth_headers).json()["days"]
    assert all(d["highlight"] is None for d in days)
