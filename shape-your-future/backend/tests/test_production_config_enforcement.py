"""
V1-22 - Production Configuration & Secret Enforcement.

`validate_production_settings()` (app/core/config.py) is the existing
safety check: it refuses to let the app run in production with a
placeholder/missing/too-short SECRET_KEY. `app/core/config.py` already
calls it once, at module scope, immediately after `settings` is built
(`validate_production_settings(settings)`). Because `app/main.py` (via
`app/core/security.py`) imports `app.core.config` before the FastAPI
`app` object is constructed, this means an unsafe production
configuration blocks the app from ever being importable/startable -
there is no code path that reaches a running server with a bad secret.

These tests exist to lock that contract in place (nothing here
previously asserted it) and to prove it holds for both the pure
validation function and real process startup.

Two testing strategies are used:

1. Direct calls to `validate_production_settings()` against freshly
   constructed `Settings()` instances. This exercises the validation
   logic itself without needing to touch process-wide state.

2. Subprocess-based checks that actually import `app.core.config` /
   `app.main` in a clean interpreter with controlled environment
   variables. This is necessary to prove the *module-level* call
   fires as a real startup boundary: `app.core.config` is already
   imported (and cached in `sys.modules`) by the time this test file
   itself runs, so an in-process re-import would not re-execute line
   61 and would not actually test enforcement at startup.
"""
import subprocess
import sys
import textwrap

import pytest

from app.core.config import Settings, validate_production_settings


# ---------------------------------------------------------------------
# 1. Pure validation function - unsafe production configs rejected
# ---------------------------------------------------------------------

@pytest.mark.parametrize(
    "secret_key",
    [
        "change-me",  # the field default
        "",
        "short-secret-under-32-chars",  # 28 chars, not the default, still too short
        "change-me-to-a-long-random-string",  # the literal placeholder shipped
        # in .env/.env.example - 33 chars, so a length-only check alone
        # would wrongly accept it. This is the actual V1-20 deploy
        # scenario: copy .env.example to .env, never touch SECRET_KEY.
        "CHANGE-ME-TO-A-LONG-RANDOM-STRING",  # same placeholder, different case
        "docker-dev-secret-not-for-production",  # the value that used to be hard-coded in compose/Dockerfile
        "dev-only-insecure-secret-key-not-for-production",  # the labelled development default
        "dev-only-" + "x" * 40,  # long, but still a dev-prefixed value
    ],
)
def test_unsafe_secret_rejected_in_production(secret_key):
    s = Settings(app_env="production", secret_key=secret_key, _env_file=None)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_production_settings(s)


def test_valid_secret_accepted_in_production():
    s = Settings(
        app_env="production",
        secret_key="a" * 40,  # long, non-placeholder
        _env_file=None,
    )
    validate_production_settings(s)  # must not raise


# ---------------------------------------------------------------------
# 2. Development/test configuration remains usable
# ---------------------------------------------------------------------

@pytest.mark.parametrize("app_env", ["development", "test", "staging"])
def test_non_production_env_never_enforces_secret_strength(app_env):
    """
    Only app_env == "production" triggers the check - this mirrors the
    existing contract exactly (no new environment concept is invented).
    The placeholder default secret_key must stay usable everywhere else,
    including whatever value local/test workflows already rely on.
    """
    s = Settings(app_env=app_env, secret_key="change-me", _env_file=None)
    validate_production_settings(s)  # must not raise


def test_default_settings_construction_is_development_and_safe():
    """
    Settings() with no overrides (what tests/local dev actually get)
    must not require a real secret.
    """
    s = Settings(_env_file=None)
    assert s.app_env == "development"
    validate_production_settings(s)  # must not raise


# ---------------------------------------------------------------------
# 3. Real process startup boundary (subprocess - see module docstring)
# ---------------------------------------------------------------------

def _run_import(module: str, env_overrides: dict[str, str]) -> subprocess.CompletedProcess:
    import os

    env = dict(os.environ)
    # Isolate from the repo's .env file and from any ambient app_env/
    # secret_key so this test's result depends only on env_overrides.
    env.pop("APP_ENV", None)
    env.pop("SECRET_KEY", None)
    env.update(env_overrides)
    code = textwrap.dedent(f"import {module}")
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=".",
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_startup_fails_fast_on_unsafe_production_secret():
    """
    Uses the ACTUAL placeholder committed in .env/.env.example (not just
    the bare "change-me" field default) - this is the literal value a
    deploy would carry if .env.example were copied to .env and never
    edited, which is the real-world V1-20 scenario.
    """
    result = _run_import(
        "app.core.config",
        {"APP_ENV": "production", "SECRET_KEY": "change-me-to-a-long-random-string"},
    )
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_startup_succeeds_with_valid_production_secret():
    result = _run_import(
        "app.core.config",
        {"APP_ENV": "production", "SECRET_KEY": "x" * 48},
    )
    assert result.returncode == 0, result.stderr


def test_app_module_import_blocked_by_unsafe_production_secret():
    """
    The validation must be wired in ahead of FastAPI app construction,
    not merely available. Importing app.main (which app startup/uvicorn
    does first) must itself fail for an unsafe production config - a
    server process can never come up misconfigured.
    """
    result = _run_import(
        "app.main",
        {"APP_ENV": "production", "SECRET_KEY": "change-me-to-a-long-random-string"},
    )
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_app_module_import_succeeds_in_development_with_placeholder_secret():
    """
    Mirrors real local/test usage: APP_ENV unset (defaults to
    development) and the committed placeholder secret. The app must
    still be importable/startable - this is the compatibility half of
    the contract.
    """
    result = _run_import("app.main", {})
    assert result.returncode == 0, result.stderr
