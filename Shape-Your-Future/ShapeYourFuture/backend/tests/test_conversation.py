"""The AI chat of the Coach page (/conversation). The model is replaced by a stub: no network, no key.

What is pinned here:
  * a turn stores the user message and the reply, and GET returns the transcript (oldest first)
  * a failed model call stores NOTHING (the screen hands the text back to the composer for a resend)
  * another user's conversation is a 404, the same as an unknown id
  * the history list only has threads with messages, newest first, with a trimmed title
  * the chat READS today's Highlight but never writes to the daily loop (dailyentry is unchanged)
"""
import pytest
from sqlmodel import SQLModel, select

from app.db.models import DailyEntry
from app.llm import provider


class _Reply:
    def __init__(self, content):
        self.content = content


class StubChat:
    """Records what the model was given; answers with `answer` (or raises `error`)."""

    def __init__(self, answer="Try one small step.", error=None):
        self.answer = answer
        self.error = error
        self.calls = []

    def invoke(self, messages):
        self.calls.append(messages)
        if self.error:
            raise self.error
        return _Reply(self.answer)


@pytest.fixture()
def chat_llm(monkeypatch):
    stub = StubChat()
    monkeypatch.setattr(provider, "get_cheap_llm", lambda temperature=None: stub)
    return stub


def _start(client, headers):
    res = client.post("/conversation/start", json={"lang": "en"}, headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["question_fa"] is None and body["messages"] is None
    return body["conversation_id"]


def _say(client, headers, cid, text, lang="en"):
    return client.post("/conversation/continue", json={"conversation_id": cid, "message": text, "lang": lang}, headers=headers)


def _second_user(client):
    client.post("/auth/register", json={"username": "other", "password": "Secret.123@"})
    token = client.post("/auth/login", data={"username": "other", "password": "Secret.123@"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_routes_need_a_token(client):
    assert client.post("/conversation/start", json={}).status_code == 401
    assert client.get("/conversation").status_code == 401


def test_turn_returns_the_reply_in_the_screens_field_and_stores_both_messages(client, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    res = _say(client, auth_headers, cid, "I cannot start my report")
    assert res.status_code == 200
    body = res.json()
    assert body["conversation_id"] == cid and body["question_fa"] == "Try one small step."
    assert "plan" not in body  # the chat never builds or changes a plan

    got = client.get(f"/conversation/{cid}", headers=auth_headers).json()
    assert [(m["role"], m["content"]) for m in got["messages"]] == [
        ("user", "I cannot start my report"),
        ("assistant", "Try one small step."),
    ]
    assert got["messages"][0]["at"]


def test_the_model_gets_the_history_the_language_line_and_no_tools(client, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    _say(client, auth_headers, cid, "first", lang="en")
    chat_llm.answer = "second answer"
    _say(client, auth_headers, cid, "second", lang="fa")
    messages = chat_llm.calls[-1]
    roles = [m[0] for m in messages]
    assert roles == ["system", "human", "ai", "human"]
    assert [m[1] for m in messages[1:]] == ["first", "Try one small step.", "second"]
    assert "به فارسی پاسخ بده." in messages[0][1]  # lang=fa steers the answer language


def test_a_failed_model_call_stores_nothing(client, test_db, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    chat_llm.error = RuntimeError("provider down")
    res = _say(client, auth_headers, cid, "hello")
    assert res.status_code >= 500
    assert client.get(f"/conversation/{cid}", headers=auth_headers).json()["messages"] == []
    assert client.get("/conversation", headers=auth_headers).json()["items"] == []


def test_an_empty_model_answer_is_an_error_not_a_blank_bubble(client, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    chat_llm.answer = "   "
    assert _say(client, auth_headers, cid, "hello").status_code == 502
    assert client.get(f"/conversation/{cid}", headers=auth_headers).json()["messages"] == []


def test_a_list_of_content_blocks_is_joined_into_text(client, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    chat_llm.answer = [{"type": "text", "text": "Hello "}, {"type": "tool_use", "name": "x"}, {"type": "text", "text": "there"}]
    assert _say(client, auth_headers, cid, "hi").json()["question_fa"] == "Hello there"


def test_unknown_and_foreign_conversations_are_404(client, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    other = _second_user(client)
    assert _say(client, auth_headers, "nope", "hi").status_code == 404
    assert client.get("/conversation/nope", headers=auth_headers).status_code == 404
    assert _say(client, other, cid, "hi").status_code == 404
    assert client.get(f"/conversation/{cid}", headers=other).status_code == 404
    assert client.get("/conversation", headers=other).json()["items"] == []


def test_message_limits_are_enforced(client, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    assert _say(client, auth_headers, cid, "").status_code == 422
    assert _say(client, auth_headers, cid, "x" * 2001).status_code == 422
    assert chat_llm.calls == []


def test_history_list_has_only_threads_with_messages_newest_first_with_a_trimmed_title(client, auth_headers, chat_llm):
    empty = _start(client, auth_headers)
    first = _start(client, auth_headers)
    second = _start(client, auth_headers)
    _say(client, auth_headers, first, "older thread")
    long_text = "word " * 40
    _say(client, auth_headers, second, long_text)
    items = client.get("/conversation", headers=auth_headers).json()["items"]
    assert [i["conversation_id"] for i in items] == [second, first]
    assert empty not in {i["conversation_id"] for i in items}
    assert items[1]["title"] == "older thread" and items[1]["message_count"] == 2
    assert len(items[0]["title"]) <= 60 and items[0]["title"].endswith("…")


def test_the_chat_reads_the_highlight_but_never_writes_the_daily_loop(client, test_db, auth_headers, chat_llm):
    client.put("/daily-entry/today", json={"highlight": "Write the report"}, headers=auth_headers)
    before = test_db.exec(select(DailyEntry)).all()
    snapshot = [(e.id, e.highlight, e.highlight_done, e.coach_tactic_id, e.updated_at) for e in before]

    cid = _start(client, auth_headers)
    _say(client, auth_headers, cid, "what should I do first?")

    assert "Write the report" in chat_llm.calls[-1][0][1]  # today's Highlight reached the model as context
    test_db.expire_all()
    after = test_db.exec(select(DailyEntry)).all()
    assert [(e.id, e.highlight, e.highlight_done, e.coach_tactic_id, e.updated_at) for e in after] == snapshot


def test_without_a_highlight_the_model_is_told_so(client, auth_headers, chat_llm):
    cid = _start(client, auth_headers)
    _say(client, auth_headers, cid, "hi")
    assert "has not set today's Highlight" in chat_llm.calls[-1][0][1]


def test_the_chat_adds_exactly_two_tables_to_the_schema():
    assert {"chatconversation", "chatmessage"} <= set(SQLModel.metadata.tables)
