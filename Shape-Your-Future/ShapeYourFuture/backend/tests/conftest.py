"""
Shared fixtures.

Key idea: we NEVER call a real LLM in tests. `fake_llm` monkeypatches
app.llm.provider.get_cheap_llm to return a stub whose
.with_structured_output(Schema) returns an object whose .invoke(messages)
returns a caller-supplied canned instance of Schema. This lets each test
control exactly what "the model said" without any network call - which
also means these tests cost nothing and never flake on provider downtime.
"""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.core.rate_limit import limiter
from app.db.database import get_db
from app.main import app


@pytest.fixture()
def test_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture()
def client(test_db):
    def _get_db_override():
        yield test_db

    app.dependency_overrides[get_db] = _get_db_override
    # `limiter` (app/core/rate_limit.py) uses slowapi's default in-memory
    # storage, which is a process-wide singleton keyed by client address.
    # TestClient always connects from the same fake address ("testclient"),
    # so without a reset here, register/login calls from an EARLIER test in
    # this same pytest process count toward THIS test's limit - tests would
    # then start failing with 429s purely based on run order/count, not on
    # anything the test itself does. Reset before AND after so this test
    # neither inherits nor leaks rate-limit state.
    limiter.reset()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    limiter.reset()


@pytest.fixture()
def auth_headers(client):
    client.post("/auth/register", json={"username": "testuser", "password": "Secret.123@"})
    res = client.post(
        "/auth/login", data={"username": "testuser", "password": "Secret.123@"}
    )
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class _FakeStructuredLLM:
    """Returned by fake_chat.with_structured_output(Schema)."""

    def __init__(self, canned_by_call):
        self._canned = canned_by_call
        self._call_index = 0

    def invoke(self, messages):
        if callable(self._canned):
            return self._canned(messages)
        if isinstance(self._canned, list):
            result = self._canned[min(self._call_index, len(self._canned) - 1)]
            self._call_index += 1
            return result
        return self._canned


class _FakeChatModel:
    def __init__(self, canned_by_call):
        # Shared across every .with_structured_output(...) call so that
        # graphs invoking get_cheap_llm() more than once (e.g. extract
        # then ack_phrase) consume the canned list in order instead of
        # each call resetting back to element 0.
        self._structured = _FakeStructuredLLM(canned_by_call)

    def with_structured_output(self, schema, **kwargs):  # kwargs: include_raw=True from the agent
        return self._structured


@pytest.fixture()
def fake_llm(monkeypatch):
    """
    Usage in a test:
        fake_llm(lambda messages: BrainDumpExtraction(items=[...]))
    or, for multi-turn graphs that call the LLM more than once in sequence,
    pass a list and each call consumes the next element:
        fake_llm([FirstSchemaInstance(...), SecondSchemaInstance(...)])
    """
    def _install(canned_by_call):
        # One shared fake model instance for the whole test, so state
        # (the call index into canned_by_call) persists across every
        # get_cheap_llm() call the graph makes.
        fake_model = _FakeChatModel(canned_by_call)
        monkeypatch.setattr(
            "app.llm.provider.get_cheap_llm",
            lambda temperature=None: fake_model,
        )

    return _install
