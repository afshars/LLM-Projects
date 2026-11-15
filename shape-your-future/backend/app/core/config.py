"""
Centralized settings. Everything secret/environment-specific comes from env
vars (.env locally, Hugging Face "Repository secrets" in production) -
never hardcoded, never committed.
"""
import logging

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("maketime")

# The ONLY secret that may exist in source code, and only so that local development works with zero setup.
# It is public, so it must never be accepted when APP_ENV=production (see validate_production_settings).
DEV_SECRET_KEY = "dev-only-insecure-secret-key-not-for-production"

# Every value that has ever been a default, placeholder or example for SECRET_KEY in this repo. Rejected in production.
KNOWN_DEV_SECRETS = frozenset(
    {
        DEV_SECRET_KEY,
        "change-me",
        "change-me-to-a-long-random-string",
        "docker-dev-secret-not-for-production",
    }
)
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    # Read from the SECRET_KEY environment variable (.env locally, compose / platform secrets elsewhere).
    # Unset or blank -> DEV_SECRET_KEY, which is refused in production.
    secret_key: str = DEV_SECRET_KEY
    access_token_expire_minutes: int = 60
    allowed_origins: str = "http://localhost:5173"

    database_url: str = "sqlite:///./app.db"

    # LLM - a single switch controls the model for EVERY chain/node.
    # The design goal is: keep this cheap/light; push reasoning complexity
    # into the graph structure & deterministic code, not into model size.
    # See app/llm/provider.py for the full list of supported values and
    # the "openai_compatible" escape hatch that works with almost any
    # provider (OpenRouter, Together, Fireworks, DeepSeek, Mistral, a
    # self-hosted vLLM server, ...).
    llm_provider: str = "groq"          # openai | anthropic | groq | ollama | openai_compatible
    llm_model_cheap: str = "llama-3.1-8b-instant"
    llm_temperature: float = 0.2

    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    groq_api_key: str | None = None

    # Used by "ollama" (base url only, no key needed) and "openai_compatible"
    # (both base url and key needed) - see app/llm/provider.py
    llm_base_url: str | None = None
    llm_api_key: str | None = None

    rate_limit_per_minute: int = 20

    # General authenticated API traffic (the cheap pure-DB routes: /profile, /daily-entry, /coach/tactic/today).
    # Deliberately separate from rate_limit_per_minute, which guards the one LLM-invoking route
    # (POST /coach/tactic/suggest) and is tuned to LLM cost, so tightening one never silently tightens the other.
    # Higher default because these are cheap operations a normal UI calls often: an abuse ceiling, not a throttle.
    general_rate_limit_per_minute: int = 60

    @field_validator("secret_key", mode="before")
    @classmethod
    def _blank_secret_means_dev_default(cls, value):
        # `SECRET_KEY=` (empty) in .env or compose must not become an empty HMAC key.
        if value is None or (isinstance(value, str) and not value.strip()):
            return DEV_SECRET_KEY
        return value

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()


def validate_production_settings(s: "Settings") -> None:
    """Fail fast rather than silently running an insecure production deploy.

    In production SECRET_KEY must be set, must not be any known dev/placeholder value (or start with "change-me"), and
    must be at least MIN_PRODUCTION_SECRET_LENGTH characters. Outside production a missing key falls back to the labelled
    DEV_SECRET_KEY, with a warning in the log."""
    secret = (s.secret_key or "").strip()
    if s.app_env == "production":
        if (
            not secret
            or secret in KNOWN_DEV_SECRETS
            or secret.lower().startswith(("change-me", "dev-only", "docker-dev"))
            or len(secret) < MIN_PRODUCTION_SECRET_LENGTH
        ):
            raise RuntimeError(
                "SECRET_KEY must be set to a long random value (at least 32 characters, not a dev or placeholder "
                "value) when APP_ENV=production. Set it in the environment, never in a committed file. "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
    elif secret in KNOWN_DEV_SECRETS:
        logger.warning("SECRET_KEY is the public development default: fine on localhost, never expose this instance.")


validate_production_settings(settings)
