"""
Single choke-point for every LLM call in the whole system.

Design intent: every chain/graph node in app/graphs/* imports get_cheap_llm()
instead of instantiating a chat model itself. That means:
  1. Swapping providers/models is a one-line env change, not a code change.
  2. Every call goes through .with_structured_output(...) at the call site
     (see graphs/*), so raw free-text completions never happen.

Supported LLM_PROVIDER values:
  - "openai"            -> OpenAI (gpt-4o-mini, gpt-4.1-nano, ...)
  - "anthropic"          -> Anthropic (claude-haiku-...)
  - "groq"                -> Groq's native API (very fast/cheap open models)
  - "ollama"               -> a local Ollama server, no API key needed
  - "openai_compatible"     -> ANY provider that speaks the OpenAI /v1 API
                               shape - this covers most of the market:
                               OpenRouter, Together AI, Fireworks, DeepSeek,
                               Mistral, Perplexity, Groq-via-OpenAI-endpoint,
                               a self-hosted vLLM/LM Studio server, etc.
                               Set LLM_BASE_URL + LLM_API_KEY + LLM_MODEL_CHEAP.

If your provider isn't one of the first four, it almost certainly still
works via "openai_compatible" - that is the intended escape hatch, not a
fallback of last resort.
"""
from functools import lru_cache

from app.core.config import settings

SUPPORTED_PROVIDERS = {"openai", "anthropic", "groq", "ollama", "openai_compatible"}


class LLMNotConfigured(RuntimeError):
    """The selected LLM provider cannot be used because its settings are missing (no API key / base
    URL) or LLM_PROVIDER is unknown.

    A RuntimeError subclass on purpose: code that already catches RuntimeError keeps working. The
    app maps it to HTTP 503 with `code: "llm_not_configured"` (see app/main.py) instead of a generic 500."""


def is_llm_configured() -> bool:
    """True when get_cheap_llm() can build a model from the current settings. Never raises, never calls the
    provider; used by /healthz so a missing key is visible without sending a chat message."""
    provider = settings.llm_provider.lower()
    if provider == "openai":
        return bool(settings.openai_api_key)
    if provider == "anthropic":
        return bool(settings.anthropic_api_key)
    if provider == "groq":
        return bool(settings.groq_api_key)
    if provider == "ollama":
        return True  # local server, no key
    if provider == "openai_compatible":
        return bool(settings.llm_base_url and settings.llm_api_key)
    return False


def get_cheap_llm(temperature: float | None = None):
    """The default model for every chain/node (LLM_MODEL_CHEAP)."""
    temp = settings.llm_temperature if temperature is None else temperature
    return _build_llm(settings.llm_model_cheap, temp)


@lru_cache
def _build_llm(model: str, temp: float):
    provider = settings.llm_provider.lower()

    if provider not in SUPPORTED_PROVIDERS:
        raise LLMNotConfigured(
            f"Unknown LLM_PROVIDER '{provider}'. Supported: {sorted(SUPPORTED_PROVIDERS)}. "
            "If your provider isn't listed, set LLM_PROVIDER=openai_compatible and point "
            "LLM_BASE_URL at its OpenAI-compatible endpoint - this works for almost anyone."
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        _require(settings.openai_api_key, "OPENAI_API_KEY")
        return ChatOpenAI(model=model, temperature=temp, api_key=settings.openai_api_key)

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        _require(settings.anthropic_api_key, "ANTHROPIC_API_KEY")
        return ChatAnthropic(model=model, temperature=temp, api_key=settings.anthropic_api_key)

    if provider == "groq":
        from langchain_groq import ChatGroq
        _require(settings.groq_api_key, "GROQ_API_KEY")
        return ChatGroq(model=model, temperature=temp, api_key=settings.groq_api_key)

    if provider == "ollama":
        from langchain_ollama import ChatOllama
        base_url = settings.llm_base_url or "http://localhost:11434"
        return ChatOllama(model=model, temperature=temp, base_url=base_url)

    # provider == "openai_compatible"
    # Works for OpenRouter, Together, Fireworks, DeepSeek, Mistral,
    # self-hosted vLLM/LM Studio, and anything else that mirrors the
    # OpenAI /v1/chat/completions shape.
    from langchain_openai import ChatOpenAI
    _require(settings.llm_base_url, "LLM_BASE_URL")
    _require(settings.llm_api_key, "LLM_API_KEY")
    return ChatOpenAI(
        model=model,
        temperature=temp,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
    )


def _require(value: str | None, env_name: str) -> None:
    if not value:
        raise LLMNotConfigured(f"{env_name} is not set (required for LLM_PROVIDER={settings.llm_provider})")
