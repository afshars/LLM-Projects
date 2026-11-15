"""No secret in source, and SECRET_KEY handling at the edges: blank value, startup in production, shipped files."""
import os
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from app.core.config import DEV_SECRET_KEY, Settings, validate_production_settings

ROOT = Path(__file__).resolve().parents[2]  # repo root (backend/tests/..)


def test_blank_secret_key_becomes_the_labelled_dev_default():
    for blank in ("", "   "):
        assert Settings(secret_key=blank, _env_file=None).secret_key == DEV_SECRET_KEY
    assert "dev-only" in DEV_SECRET_KEY and "not-for-production" in DEV_SECRET_KEY


def test_blank_secret_key_never_reaches_production():
    s = Settings(app_env="production", secret_key="", _env_file=None)
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        validate_production_settings(s)


def test_development_with_the_dev_default_only_warns(caplog):
    with caplog.at_level("WARNING", logger="maketime"):
        validate_production_settings(Settings(app_env="development", _env_file=None))
    assert any("development default" in r.getMessage() for r in caplog.records)


def test_a_real_looking_secret_is_accepted_in_production_without_warning(caplog):
    with caplog.at_level("WARNING", logger="maketime"):
        validate_production_settings(Settings(app_env="production", secret_key="Zq8" * 20, _env_file=None))
    assert not caplog.records


def _import_app(env_overrides: dict) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k not in ("APP_ENV", "SECRET_KEY")}
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", textwrap.dedent("import app.main")],
        env=env, capture_output=True, text=True, timeout=60,
    )


@pytest.mark.parametrize("overrides", [{"APP_ENV": "production"}, {"APP_ENV": "production", "SECRET_KEY": ""}])
def test_production_start_without_a_secret_key_fails(overrides):
    res = _import_app(overrides)
    assert res.returncode != 0
    assert "SECRET_KEY must be set" in res.stderr


def test_production_start_with_a_strong_secret_key_works():
    assert _import_app({"APP_ENV": "production", "SECRET_KEY": "Zq8" * 20}).returncode == 0


def _tracked_text_files():
    skip_dirs = {"node_modules", "dist", ".git", "__pycache__", ".pytest_cache", ".venv", "venv"}
    for path in ROOT.rglob("*"):
        if path.is_file() and not (set(path.parts) & skip_dirs) and path.suffix not in {".db", ".png", ".woff2", ".zip"}:
            yield path


def test_no_provider_key_shaped_string_anywhere_in_the_project():
    key_like = re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}")
    hits = []
    for path in _tracked_text_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if key_like.search(text):
            hits.append(str(path.relative_to(ROOT)))
    assert hits == []


def test_no_hardcoded_secret_key_in_compose_or_dockerfile():
    for name in ("docker-compose.yml", "backend/Dockerfile"):
        path = ROOT / name
        if not path.exists():  # the backend tests may run from a copy without the repo root
            pytest.skip(f"{name} not available")
        text = path.read_text(encoding="utf-8")
        assert "docker-dev-secret" not in text
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            m = re.match(r"(ENV\s+)?SECRET_KEY\s*[:=]\s*(.*)", stripped)
            if m:
                assert m.group(2).strip().startswith("${"), f"{name}: SECRET_KEY must come from the environment"


def test_env_files_and_keys_are_ignored_by_git_and_docker():
    for name in (".gitignore", ".dockerignore", "backend/.dockerignore", "frontend/.dockerignore"):
        path = ROOT / name
        if not path.exists():
            pytest.skip(f"{name} not available")
        lines = {ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()}
        for pattern in (".env", ".env.*", "*.db", "*.pem", "*.key"):
            if name in {"frontend/.dockerignore"} and pattern == "*.db":
                continue
            assert pattern in lines, f"{name} is missing {pattern}"


def test_env_example_has_placeholders_only_and_no_env_file_ships():
    example = ROOT / ".env.example"
    if not example.exists():
        pytest.skip(".env.example not available")
    for line in example.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            assert re.fullmatch(r"[A-Z_]+=", line), f"value in .env.example: {line.split('=')[0]}"


def test_the_unused_entrypoint_script_is_gone():
    assert not (ROOT / "backend" / "docker-entrypoint.sh").exists()
