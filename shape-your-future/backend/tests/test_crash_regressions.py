"""Regression tests for the crash bugs found in AUDIT-crash-and-halfdone.md (Step 6).

B1  confirm routes answered 500 for a bad ISO date. Obsolete: every route that took such a date was removed
    (brain-dump/growth in Step 7, /chains/* and the planning chat in Step 2 of the final cleanup).
B2  PUT /user-intelligence/goals: obsolete, the route was removed in Step 7.
B3  a missing LLM key answered a generic 500 (now 503 with code "llm_not_configured").
"""
import pytest

from app.core.config import settings
from app.llm import provider

# ---------------- Step 7: removed routes stay removed ----------------

@pytest.mark.parametrize(
    "method,url",
    [
        ("put", "/user-intelligence/goals"),
        ("get", "/goals"),
        ("get", "/behavior/patterns"),
        ("get", "/busy-blocks"),
        ("get", "/planning-proposals/1"),
        ("post", "/chains/brain-dump"),
        ("post", "/chains/brain-dump/confirm"),
        ("post", "/chains/plan/interview"),
        ("post", "/chains/plan/propose"),
        ("post", "/chains/growth/run"),
        ("post", "/chains/growth/confirm"),
        # Step 2: the planning chat and the old progress-check were removed (they saved AI output before approval)
        ("post", "/chains/plan/confirm"),
        ("post", "/chains/progress-check"),
        ("post", "/chains/progress-check/confirm"),
        ("post", "/conversation/plans/1/confirm"),
        # Step 3: the old planning / focus stack was deleted (no page called it)
        ("get", "/daily-plan"),
        ("get", "/daily-plan/now"),
        ("post", "/focus/start"),
        ("post", "/focus/finish"),
        ("post", "/focus/feedback"),
    ],
)
def test_removed_routes_answer_404_or_405(client, auth_headers, method, url):
    res = getattr(client, method)(url, headers=auth_headers)
    assert res.status_code in (404, 405), (url, res.status_code)


# ---------------- B3 ----------------

@pytest.fixture()
def no_llm_key(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", None)
    provider._build_llm.cache_clear()
    yield
    provider._build_llm.cache_clear()


def test_missing_key_raises_the_dedicated_error(no_llm_key):
    with pytest.raises(provider.LLMNotConfigured):
        provider.get_cheap_llm()
    # still a RuntimeError, so older `except RuntimeError` code keeps working
    assert issubclass(provider.LLMNotConfigured, RuntimeError)


def test_unknown_provider_raises_the_dedicated_error(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "no-such-provider")
    provider._build_llm.cache_clear()
    with pytest.raises(provider.LLMNotConfigured):
        provider.get_cheap_llm()
    provider._build_llm.cache_clear()


def test_missing_key_answers_503_with_stable_code(client, auth_headers, no_llm_key):
    res = client.post("/coach/tactic/suggest", json={"obstacle": "my phone keeps pinging", "lang": "en"}, headers=auth_headers)
    assert res.status_code == 503, res.text
    body = res.json()
    assert body["code"] == "llm_not_configured"
    assert "GROQ_API_KEY" not in res.text  # the env var name stays in the log, not in the response


def test_healthz_reports_llm_configuration(client, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "groq_api_key", None)
    assert client.get("/healthz").json()["llm_configured"] is False
    monkeypatch.setattr(settings, "groq_api_key", "test-key-not-real")
    assert client.get("/healthz").json()["llm_configured"] is True


@pytest.mark.parametrize(
    "provider_name,field,expected",
    [
        ("openai", "openai_api_key", True),
        ("anthropic", "anthropic_api_key", True),
        ("groq", "groq_api_key", True),
    ],
)
def test_is_llm_configured_per_provider(monkeypatch, provider_name, field, expected):
    monkeypatch.setattr(settings, "llm_provider", provider_name)
    monkeypatch.setattr(settings, field, None)
    assert provider.is_llm_configured() is False
    monkeypatch.setattr(settings, field, "test-key-not-real")
    assert provider.is_llm_configured() is expected


def test_is_llm_configured_ollama_and_compatible(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "ollama")
    assert provider.is_llm_configured() is True
    monkeypatch.setattr(settings, "llm_provider", "openai_compatible")
    monkeypatch.setattr(settings, "llm_base_url", None)
    monkeypatch.setattr(settings, "llm_api_key", "test-key-not-real")
    assert provider.is_llm_configured() is False
    monkeypatch.setattr(settings, "llm_base_url", "http://localhost:1234/v1")
    assert provider.is_llm_configured() is True
    monkeypatch.setattr(settings, "llm_provider", "no-such-provider")
    assert provider.is_llm_configured() is False
