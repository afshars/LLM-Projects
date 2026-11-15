"""Coach: suggest saves nothing, confirm saves one grounded tactic on today's DailyEntry."""
from datetime import datetime, timezone

import pytest
from sqlmodel import select

from app.db.models import DailyEntry
from app.llm.blocker_map import BLOCKER_TACTIC_FAMILY
from app.llm.tactics import tactics_for_stage
from app.schemas.chains import BlockerClassification, TacticPick


class _FakeLLM:
    def __init__(self, blocker="distracted", confidence=0.9, tactic_id=None):
        self.blocker, self.confidence, self.tactic_id = blocker, confidence, tactic_id
        self.schema = None

    def with_structured_output(self, schema):
        self.schema = schema
        return self

    def invoke(self, _messages):
        if self.schema is BlockerClassification:
            return BlockerClassification(blocker_type=self.blocker, confidence=self.confidence, evidence_fa="x")
        assert self.schema is TacticPick
        return TacticPick(tactic_id=self.tactic_id, confidence=0.8)


def _llm(monkeypatch, **kw):
    fake = _FakeLLM(**kw)
    monkeypatch.setattr("app.llm.provider.get_cheap_llm", lambda temperature=None: fake)


def _count(db):
    return len(db.exec(select(DailyEntry)).all())


@pytest.mark.parametrize("method,path", [("post", "/coach/tactic/suggest"), ("post", "/coach/tactic/confirm"), ("get", "/coach/tactic/today")])
def test_every_route_needs_a_login(client, method, path):
    kwargs = {"json": {}} if method == "post" else {}
    assert getattr(client, method)(path, **kwargs).status_code == 401


def test_suggest_returns_one_grounded_tactic_and_saves_nothing(client, test_db, auth_headers, monkeypatch):
    stage_tactic = tactics_for_stage(BLOCKER_TACTIC_FAMILY["distracted"]["stage"])[2]
    _llm(monkeypatch, blocker="distracted", tactic_id=stage_tactic.id)
    res = client.post("/coach/tactic/suggest", json={"obstacle": "my phone keeps pinging", "lang": "en"}, headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["needs_clarification"] is False
    assert body["blocker_type"] == "distracted"
    assert body["tactic"]["id"] == stage_tactic.id
    assert (body["tactic"]["title_en"], body["tactic"]["title_fa"]) == (stage_tactic.title_en, stage_tactic.title_fa)
    assert _count(test_db) == 0  # AI output is not stored without a confirmation
    assert client.get("/coach/tactic/today", headers=auth_headers).json()["tactic"] is None


def test_suggest_falls_back_when_the_model_invents_a_tactic_id(client, test_db, auth_headers, monkeypatch):
    _llm(monkeypatch, blocker="energy", tactic_id=999999)
    body = client.post("/coach/tactic/suggest", json={"obstacle": "so tired", "lang": "en"}, headers=auth_headers).json()
    first = tactics_for_stage(BLOCKER_TACTIC_FAMILY["energy"]["stage"])[0]
    assert body["tactic"]["id"] == first.id


@pytest.mark.parametrize("blocker,confidence", [("distracted", 0.3), ("not-a-type", 0.95)])
def test_suggest_asks_for_more_when_unsure(client, auth_headers, monkeypatch, blocker, confidence):
    _llm(monkeypatch, blocker=blocker, confidence=confidence, tactic_id=1)
    body = client.post("/coach/tactic/suggest", json={"obstacle": "meh"}, headers=auth_headers).json()
    assert body == {"needs_clarification": True, "blocker_type": None, "tactic": None}


def test_suggest_validates_the_input(client, auth_headers):
    assert client.post("/coach/tactic/suggest", json={"obstacle": ""}, headers=auth_headers).status_code == 422
    assert client.post("/coach/tactic/suggest", json={"obstacle": "x" * 1001}, headers=auth_headers).status_code == 422


def test_confirm_saves_on_today_and_get_returns_it(client, test_db, auth_headers):
    tactic = tactics_for_stage("laser")[0]
    res = client.post("/coach/tactic/confirm", json={"tactic_id": tactic.id, "blocker_type": "distracted"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["tactic"]["id"] == tactic.id
    row = test_db.exec(select(DailyEntry)).one()
    assert (row.coach_tactic_id, row.coach_blocker_type) == (tactic.id, "distracted")
    assert row.entry_date == datetime.now(timezone.utc).date()
    got = client.get("/coach/tactic/today", headers=auth_headers).json()
    assert got["tactic"]["title_en"] == tactic.title_en and got["tactic"]["description_fa"] == tactic.desc_fa and got["blocker_type"] == "distracted"


def test_confirm_keeps_the_rest_of_the_entry_and_replaces_the_tactic(client, test_db, auth_headers):
    client.put("/daily-entry/today", json={"highlight": "Write"}, headers=auth_headers)
    a, b = tactics_for_stage("laser")[:2]
    client.post("/coach/tactic/confirm", json={"tactic_id": a.id}, headers=auth_headers)
    client.post("/coach/tactic/confirm", json={"tactic_id": b.id, "blocker_type": "bogus"}, headers=auth_headers)
    row = test_db.exec(select(DailyEntry)).one()
    assert row.highlight == "Write" and row.coach_tactic_id == b.id and row.coach_blocker_type is None


def test_confirm_rejects_an_unknown_tactic_and_stores_nothing(client, test_db, auth_headers):
    assert client.post("/coach/tactic/confirm", json={"tactic_id": 999999}, headers=auth_headers).status_code == 422
    assert _count(test_db) == 0


def test_confirmed_tactic_is_private_to_the_user(client, test_db, auth_headers):
    client.post("/coach/tactic/confirm", json={"tactic_id": tactics_for_stage("laser")[0].id}, headers=auth_headers)
    client.post("/auth/register", json={"username": "other", "password": "Secret.123@"})
    token = client.post("/auth/login", data={"username": "other", "password": "Secret.123@"}).json()["access_token"]
    assert client.get("/coach/tactic/today", headers={"Authorization": f"Bearer {token}"}).json()["tactic"] is None


def test_llm_not_configured_is_a_503(client, auth_headers, monkeypatch):
    from app.llm.provider import LLMNotConfigured

    def boom(temperature=None):
        raise LLMNotConfigured("no key")

    monkeypatch.setattr("app.llm.provider.get_cheap_llm", boom)
    res = client.post("/coach/tactic/suggest", json={"obstacle": "x"}, headers=auth_headers)
    assert res.status_code == 503 and res.json()["code"] == "llm_not_configured"


def test_old_dailyentry_table_gets_the_new_columns(monkeypatch):
    from sqlalchemy import text
    from sqlmodel import create_engine

    from app.db import database

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE dailyentry (id INTEGER PRIMARY KEY, user_id INTEGER, entry_date DATE)"))
        database._apply_column_migrations(conn, "dailyentry", database._DAILY_ENTRY_COLUMN_MIGRATIONS)
        database._apply_column_migrations(conn, "dailyentry", database._DAILY_ENTRY_COLUMN_MIGRATIONS)  # idempotent
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(dailyentry)")).fetchall()}
    assert {"coach_tactic_id", "coach_blocker_type"} <= cols
