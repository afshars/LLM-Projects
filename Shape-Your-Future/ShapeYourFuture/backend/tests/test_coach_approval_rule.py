"""The core rule: no AI output is saved without the user's explicit approval, and an approved tactic shows up in the
daily loop (Today and Reflect read it from GET /daily-entry/today; Reflect writes the user's own "applied" answer)."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlmodel import SQLModel, select

from app.db.models import DailyEntry
from app.llm.tactics import tactics_for_stage
from app.schemas.chains import BlockerClassification, TacticPick

APP_DIR = Path(__file__).resolve().parents[1] / "app"


class _FakeLLM:
    def __init__(self, tactic_id):
        self.tactic_id, self.schema, self.calls = tactic_id, None, 0

    def with_structured_output(self, schema):
        self.schema = schema
        return self

    def invoke(self, _messages):
        self.calls += 1
        if self.schema is BlockerClassification:
            return BlockerClassification(blocker_type="distracted", confidence=0.9, evidence_fa="x")
        return TacticPick(tactic_id=self.tactic_id, confidence=0.8)


@pytest.fixture()
def fake(monkeypatch):
    tactic = tactics_for_stage("laser")[1]
    llm = _FakeLLM(tactic.id)
    monkeypatch.setattr("app.llm.provider.get_cheap_llm", lambda temperature=None: llm)
    return llm, tactic


def _row_counts(db):
    return {t.name: len(db.exec(select(t)).all()) for t in SQLModel.metadata.sorted_tables}


def _today():
    return datetime.now(timezone.utc).date()


# ------------------------------------------------ (a) nothing is saved without approval


def test_suggest_changes_no_table_at_all(client, test_db, auth_headers, fake):
    llm, tactic = fake
    before = _row_counts(test_db)
    res = client.post("/coach/tactic/suggest", json={"obstacle": "my phone keeps pinging", "lang": "en"}, headers=auth_headers)
    assert res.status_code == 200 and res.json()["tactic"]["id"] == tactic.id
    assert llm.calls == 2  # the model really ran (classify + pick) ...
    assert _row_counts(test_db) == before  # ... and not one row in any table changed


def test_rejecting_means_never_calling_confirm_so_nothing_exists_in_the_loop(client, test_db, auth_headers, fake):
    client.post("/coach/tactic/suggest", json={"obstacle": "phone"}, headers=auth_headers)
    entry = client.get("/daily-entry/today", headers=auth_headers).json()
    assert entry["tactic"] is None and entry["tactic_applied"] is None and entry["exists"] is False
    assert client.get("/coach/tactic/today", headers=auth_headers).json()["tactic"] is None


def test_the_legacy_planning_tables_and_routes_are_gone(client, auth_headers):
    names = set(SQLModel.metadata.tables)
    assert "dailyplanrecord" not in names and "conversationsession" not in names
    # The whole schema: Step 3 removed every other table; the AI chat of the Coach page added its own two.
    assert names == {"user", "dailyentry", "chatconversation", "chatmessage"}
    paths = {getattr(r, "path", "") for r in client.app.routes}
    assert not [p for p in paths if p.startswith("/chains")]
    assert not [p for p in paths if p.startswith("/conversation/plans")]  # the chat has no plans


def test_only_the_coach_tactic_and_chat_code_call_the_llm():
    """Static inventory: an LLM is built for a request in exactly two places. services/coach_tactics.py is reached only
    from POST /coach/tactic/suggest (writes nothing). services/chat_service.py is reached only from the /conversation
    routes and writes nothing but its own chat messages (tests/test_conversation.py checks the daily loop stays untouched)."""
    users = []
    for path in APP_DIR.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if re.search(r"get_cheap_llm\(", text) and path.name != "provider.py":
            users.append(str(path.relative_to(APP_DIR)))
    assert sorted(users) == ["services/chat_service.py", "services/coach_tactics.py"]
    routes = [p.name for p in (APP_DIR / "api" / "routes").glob("*.py") if "coach_tactics" in p.read_text(encoding="utf-8")]
    assert routes == ["coach.py"]
    chat_routes = [p.name for p in (APP_DIR / "api" / "routes").glob("*.py") if "chat_service" in p.read_text(encoding="utf-8")]
    assert chat_routes == ["conversation.py"]


def test_the_coach_flow_never_touches_the_legacy_daily_log():
    for rel in ("api/routes/coach.py", "services/coach_tactics.py", "schemas/coach.py"):
        text = (APP_DIR / rel).read_text(encoding="utf-8")
        assert "DailyLog" not in text and "DailyPlanRecord" not in text, rel


# ------------------------------------------------ (b) an approved tactic appears in Today and Reflect


def test_confirmed_tactic_is_in_the_daily_entry_that_today_and_reflect_read(client, test_db, auth_headers, fake):
    _, tactic = fake
    client.post("/coach/tactic/suggest", json={"obstacle": "phone"}, headers=auth_headers)
    assert client.post("/coach/tactic/confirm", json={"tactic_id": tactic.id, "blocker_type": "distracted"}, headers=auth_headers).status_code == 200
    entry = client.get("/daily-entry/today", headers=auth_headers).json()
    assert entry["exists"] is True
    assert entry["tactic"]["id"] == tactic.id
    assert entry["tactic"]["title_en"] == tactic.title_en and entry["tactic"]["title_fa"] == tactic.title_fa
    assert entry["tactic_applied"] is None  # not answered yet


def test_reflect_can_record_whether_the_tactic_was_applied(client, test_db, auth_headers, fake):
    _, tactic = fake
    client.post("/coach/tactic/confirm", json={"tactic_id": tactic.id}, headers=auth_headers)
    for answer in (True, False):
        res = client.put("/daily-entry/today", json={"tactic_applied": answer}, headers=auth_headers)
        assert res.status_code == 200 and res.json()["tactic_applied"] is answer
    row = test_db.exec(select(DailyEntry)).one()
    assert row.coach_tactic_applied is False
    # the other Reflect answers are untouched by it
    assert res.json()["highlight_done"] is False and res.json()["energy"] is None


def test_applied_needs_a_confirmed_tactic(client, test_db, auth_headers):
    client.put("/daily-entry/today", json={"highlight": "Write"}, headers=auth_headers)
    res = client.put("/daily-entry/today", json={"tactic_applied": True}, headers=auth_headers)
    assert res.status_code == 422
    assert test_db.exec(select(DailyEntry)).one().coach_tactic_applied is None


def test_a_different_tactic_resets_the_applied_answer(client, test_db, auth_headers):
    a, b = tactics_for_stage("laser")[:2]
    client.post("/coach/tactic/confirm", json={"tactic_id": a.id}, headers=auth_headers)
    client.put("/daily-entry/today", json={"tactic_applied": True}, headers=auth_headers)
    client.post("/coach/tactic/confirm", json={"tactic_id": a.id}, headers=auth_headers)  # same one again: kept
    assert client.get("/daily-entry/today", headers=auth_headers).json()["tactic_applied"] is True
    client.post("/coach/tactic/confirm", json={"tactic_id": b.id}, headers=auth_headers)
    entry = client.get("/daily-entry/today", headers=auth_headers).json()
    assert entry["tactic"]["id"] == b.id and entry["tactic_applied"] is None


def test_tactic_applied_rejects_non_booleans(client, auth_headers):
    assert client.put("/daily-entry/today", json={"tactic_applied": "yes"}, headers=auth_headers).status_code == 422


def test_coach_uses_the_users_calendar_day_like_the_rest_of_the_loop(client, test_db, auth_headers):
    """Near local midnight the user's day can be one ahead of / behind the server's UTC day (AUDIT row 2)."""
    tactic = tactics_for_stage("laser")[0]
    ahead = (_today() + timedelta(days=1)).isoformat()
    assert client.post(f"/coach/tactic/confirm?day={ahead}", json={"tactic_id": tactic.id}, headers=auth_headers).status_code == 200
    assert client.get(f"/daily-entry/today?day={ahead}", headers=auth_headers).json()["tactic"]["id"] == tactic.id
    assert client.get(f"/coach/tactic/today?day={ahead}", headers=auth_headers).json()["tactic"]["id"] == tactic.id
    assert client.get("/daily-entry/today", headers=auth_headers).json()["tactic"] is None  # server day: nothing
    far = (_today() + timedelta(days=5)).isoformat()
    assert client.post(f"/coach/tactic/confirm?day={far}", json={"tactic_id": tactic.id}, headers=auth_headers).status_code == 422


def test_tactics_are_private_per_user(client, test_db, auth_headers):
    tactic = tactics_for_stage("laser")[0]
    client.post("/coach/tactic/confirm", json={"tactic_id": tactic.id}, headers=auth_headers)
    client.post("/auth/register", json={"username": "other", "password": "Secret.123@"})
    token = client.post("/auth/login", data={"username": "other", "password": "Secret.123@"}).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}
    assert client.get("/daily-entry/today", headers=other).json()["tactic"] is None
