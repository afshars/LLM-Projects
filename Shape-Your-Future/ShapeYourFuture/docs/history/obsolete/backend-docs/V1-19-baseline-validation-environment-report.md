> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-19 — Full-suite baseline validation (environment inspection)

Status: **Phase 1 only. Phases 2+ (running the suite) could not be
started — see §3.** No files changed.

## 1. Goal

Establish a trustworthy, real `pytest` baseline for the current
repository (post V1-16B/V1-17/V1-18), replacing the "traced against
static source, never executed" caveat every prior milestone in this
project has had to carry in this sandbox.

## 2. Phase 1 — Environment inspection

| Item | Finding |
|---|---|
| Python version | `Python 3.12.3` (system interpreter) |
| pip | `24.0`, from `/usr/lib/python3/dist-packages/pip` |
| pytest installed? | **No** — `import pytest` → `ModuleNotFoundError` |
| fastapi installed? | **No** |
| sqlmodel installed? | **No** |
| pydantic installed? | **No** |
| Any other `requirements.txt` package installed? | **No** — none found anywhere on the filesystem (checked `dist-packages`, `site-packages`, and this session's own `uv` cache) |
| Declared versions (`backend/requirements.txt`) | `fastapi==0.115.0`, `uvicorn[standard]==0.30.6`, `pydantic==2.9.2`, `pydantic-settings==2.5.2`, `sqlmodel==0.0.22`, `python-multipart==0.0.9`, `langchain==0.3.4` (langchain-core intentionally unpinned, resolved by langchain's own constraint), `langgraph==0.2.28`, `langchain-openai==0.2.2`, `langchain-anthropic==0.2.3`, `langchain-groq==0.2.0`, `langchain-ollama==0.2.0`, `slowapi==0.1.9`, `python-dotenv==1.0.1`; dev/test: `pytest==8.3.3`, `httpx==0.27.2` |
| Lockfile (`uv.lock`/`poetry.lock`/similar) | None present in the archive |
| pytest config (`pytest.ini`/`pyproject.toml`/`setup.cfg`/`tox.ini`) | None present — pytest would run with defaults, from `backend/` |
| Required env vars for tests | None beyond what `backend/.env` already provides. `app/core/config.py`'s `Settings` (pydantic-settings) has defaults for every field; `validate_production_settings()` only enforces a real `SECRET_KEY` when `APP_ENV=production`, which tests never set. No LLM API key is required — `tests/conftest.py`'s `fake_llm` fixture monkeypatches `app.llm.provider.get_cheap_llm` so no real provider call is ever made. |
| A pre-existing project virtualenv/wheel cache | **None found.** Searched `dist-packages`, all `site-packages` paths, `/home/claude/.cache/uv` (only unrelated cached wheels for `odfpy`/`pyoo`/`path-and-address` were present, plus documentation SVG assets that happen to be named `fastapi.svg`/`pydantic.svg` — not actual packages), and confirmed no `conda` installation exists. |

## 3. Why Phase 2 (running the suite) could not proceed

Installing the declared versions requires network access to either
PyPI (`pip install -r requirements.txt`) or the OS package repository
(`apt-get install python3-fastapi ...` as a fallback, which in any
case would not match the pinned versions). Both were attempted and
both are blocked in this sandbox:

* `pip install fastapi` → `ERROR: Could not find a version that
  satisfies the requirement fastapi (from versions: none) / No
  matching distribution found for fastapi`
* `curl https://pypi.org/simple/fastapi/` → HTTP `403`
* `apt-get update` → `403 Forbidden` on every `archive.ubuntu.com`
  repository

This is the identical constraint V1-17 and V1-18 each hit and
documented in their own reports (`docs/V1-17-focus-nextaction-lifecycle-contract.md`
§6, `docs/V1-18-decision-engine-planning-graph-audit.md` §1). It has
not changed between milestones — this is a property of the sandbox
this Claude instance is currently running in, not of the repository.

Per V1-19's own Phase 1 instruction ("If the environment [does not
have dependencies available], report clearly and do not proceed to
fabricate a pytest run" — and this project's own repeated,
higher-level instruction to "never invent pytest results"), this
report stops here rather than simulating, estimating, or otherwise
guessing what a real run would show.

## 4. What this means for V1-17/V1-18's CONDITIONAL PASS status

Unchanged. Nothing in this environment inspection contradicts either
milestone's source-level findings (V1-17: Focus/NextAction lifecycle
separation is intentional and unchanged; V1-18: three
test/tooling-substring artifacts, two stale `decision_id`-contract
assertions, zero production bugs). Both remain CONDITIONAL PASS for
exactly the reason they already stated: their conclusions are correct
by static analysis but have never been confirmed by an actual pytest
run.

## 5. No changes made

No production file, test file, or existing documentation file was
modified for V1-19. This file is the only addition.

## 6. Recommendation

A real baseline requires running `pytest` for this repository in an
environment that either:

1. has outbound network access to PyPI (a plain `pip install -r
   requirements.txt && pytest` would suffice), or
2. has the pinned dependency set already available offline (a
   pre-built wheelhouse, a pre-existing virtualenv/container image
   built from this same `requirements.txt`, or an internal package
   mirror), or
3. is the project's own existing CI/dev environment (e.g. wherever
   V1-16B's own baseline of "1354 passed, 5 known pre-existing
   failures" was originally produced) — running from there would be
   both faster and more directly comparable to that historical number.

Until one of those is available to a Claude instance working on this
repository, every milestone's test conclusions in this sandbox will
necessarily remain source-level/CONDITIONAL rather than pytest-
confirmed. This is worth surfacing as a standing constraint rather
than re-discovering and re-documenting it at the start of every future
milestone.
