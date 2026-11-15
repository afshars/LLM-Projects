> OBSOLETE (moved in Step 4): describes backend code removed in Steps 7, 8 and 3 (goals, decomposition, focus, planning, user-intelligence). History only.

# V1-22 — Production Configuration & Secret Enforcement

## 1. Scope

Narrow hardening milestone: make the existing production-safety
validation (`validate_production_settings()`) actually enforce a safe
`SECRET_KEY` at application startup, while leaving development/test
behavior untouched. No new configuration framework, no secrets
manager, no Docker/CI/deployment changes, no changes to auth
semantics, JWT format, database behavior, or any product logic
(Decision Engine, Planning Graph, DailyFlow, DailyCoach, Learning
Loop, Focus lifecycle, `/decompose`, NextAction contract).

## 2. V1-20 finding (as originally reported)

> `validate_production_settings()` exists in `app/core/config.py`, but
> is never called from `app/main.py` or anywhere else — confirmed by
> `grep -rn validate_production_settings app` matching only its own
> definition. A production deployment with the placeholder
> `SECRET_KEY=change-me-to-a-long-random-string` would start up
> successfully and silently sign every JWT with a guessable key.

## 3. Existing configuration contract (Phase 1/2 inspection)

Per instruction, the finding was **not** assumed to still hold —
current source was inspected and executed before any change was made.

- `Settings` (`app/core/config.py`) is a `pydantic-settings`
  `BaseSettings` with `app_env: str = "development"` and
  `secret_key: str = "change-me"`. Values come from process env vars,
  then `.env`, then these defaults.
- An application-level mode concept **already exists**: `app_env`,
  distinguishing `"production"` from everything else. No new mode
  concept was introduced.
- `validate_production_settings(s)` only acts when `s.app_env ==
  "production"`; every other value (`"development"`, `"test"`,
  anything else) is a no-op, so no environment is forced to behave
  like production.
- `.env` and `.env.example` are byte-identical and both ship the
  literal placeholder `SECRET_KEY=change-me-to-a-long-random-string`,
  `APP_ENV=development`.
- **Contrary to the V1-20 finding as written**, `grep -rn
  validate_production_settings app` on the current source returns
  **two** matches, not one:
  - `app/core/config.py:49` — the definition
  - `app/core/config.py:61` — `validate_production_settings(settings)`,
    called at **module scope**, immediately after `settings =
    Settings()` is constructed.

  Because `app/main.py` imports `app.api.routes.auth` →
  `app.core.security` → `app.core.config` before the `FastAPI` app
  object is ever created, this module-level call already fires before
  any app/route/middleware exists. `[SOURCE VERIFIED]`, then
  `[EXECUTED]` (see §9): importing `app.main` with an unsafe
  production `SECRET_KEY` raises `RuntimeError` and the import never
  completes — there is no code path to a running server.
- No test file previously referenced `app_env`, `APP_ENV`, or
  `validate_production_settings` at all — the contract was completely
  unverified by the test suite, even though the underlying code was
  already wired up.

**Conclusion of Phase 1/2:** the specific claim in the V1-20 finding
("never called from `app/main.py` or anywhere else") no longer matches
current source. The wiring already exists. The file's `git`-free mtime
metadata is consistent with this: `config.py` predates both the V1-20
and V1-21 documents, so the module-level call was already present when
the V1-20 audit was written, and the audit's grep claim does not match
what is actually in the file.

## 4. Root cause (the part of the finding that *does* still hold)

Inspection did not stop at "is it called" — the validator's own logic
was checked against the literal value actually committed in
`.env`/`.env.example`:

```python
if s.secret_key in ("change-me", "", None) or len(s.secret_key) < 32:
    raise RuntimeError(...)
```

`"change-me-to-a-long-random-string"` — the actual shipped
placeholder — is **33 characters long** and is not the literal string
`"change-me"`. It therefore satisfies neither rejection condition and
was **silently accepted** as a valid production secret. `[EXECUTED]`:

```
>>> s = "change-me-to-a-long-random-string"
>>> len(s)
33
>>> s in ("change-me", "", None)
False
```

So the risk the V1-20 finding actually describes — a production
deploy that copies `.env.example` to `.env` and never edits
`SECRET_KEY` — was **still live**, just for a different reason than
originally stated: not "the check never runs," but "the check runs
and lets the real-world placeholder through."

## 5. Implementation

One function was changed, in place, with no new abstractions:

`app/core/config.py` — `validate_production_settings()` now detects
any `change-me`-prefixed value (case-insensitive), not only the exact
string `"change-me"`, in addition to the existing length check:

```python
secret = s.secret_key or ""
is_placeholder = secret.strip().lower().startswith("change-me")
if is_placeholder or len(secret) < 32:
    raise RuntimeError(...)
```

This catches the field default, the committed `.env.example`
placeholder, and any similarly-named future placeholder, without
hardcoding the exact placeholder string (so it won't silently drift
out of sync if `.env.example`'s wording changes).

No other file was modified. The module-level call site
(`validate_production_settings(settings)` at the bottom of
`config.py`) was left exactly as-is — it was already the correct
startup boundary (see §6).

## 6. Startup boundary selected and why

**No new call site was added.** The existing module-level invocation,
immediately after `settings = Settings()` in `app/core/config.py`, is
the boundary: it fires the moment anything imports
`app.core.config` — which `app/main.py` does transitively (via
`app.core.security`) before constructing the `FastAPI` app, and which
any WSGI/ASGI runner, script, or one-off tool importing this codebase
would also do. This is earlier and broader than a `lifespan` hook or a
route dependency would be, and requires no new call site to maintain.
Given `app_env` and the validator already existed, adding a *second*
call site elsewhere would only create two sources of truth for no
benefit — the minimal-change instruction pointed at fixing the
validator's logic, not relocating its call.

## 7. Development/test behavior

Unaffected. `app_env` defaults to `"development"`, under which
`validate_production_settings` is a no-op regardless of `secret_key`.
No test needs a real production secret. Full suite run: **1382
passed** (1368 pre-existing + 14 new), 0 failed, 0 skipped.

## 8. Production behavior

- `APP_ENV=production` + `SECRET_KEY=change-me` → rejected (pre-existing).
- `APP_ENV=production` + `SECRET_KEY=change-me-to-a-long-random-string`
  (the actual `.env.example` value) → **now rejected** (was previously
  accepted — this is the fix).
- `APP_ENV=production` + `SECRET_KEY=` (empty) or any value under 32
  characters → rejected.
- `APP_ENV=production` + a long, non-placeholder `SECRET_KEY` →
  accepted, app starts normally.
- `docs_url`/`redoc_url` disabling and the `Strict-Transport-Security`
  header, both already gated on `app_env == "production"` in
  `app/main.py`, are untouched by this change.

## 9. Tests and verification

New file: `backend/tests/test_production_config_enforcement.py` (14
tests, all `[EXECUTED]`):

1. **Unsafe production configs rejected** — `"change-me"`, `""`, a
   short non-default string, and (the regression-locking case) the
   literal `.env.example` placeholder in both original and upper case.
2. **Valid production config accepted** — a long, non-placeholder
   secret passes `validate_production_settings` without raising.
3. **Development/test remain usable** — `app_env` in
   `{"development", "test", "staging"}` never enforces secret
   strength, and a bare `Settings()` (what local/test code actually
   gets) is development-mode and safe by default.
4. **Startup boundary is real, via subprocess** — a fresh interpreter
   importing `app.core.config` with `APP_ENV=production` and the
   placeholder secret exits non-zero; the same with a strong secret
   exits zero. Importing `app.main` (mirroring how a server process
   actually boots) is blocked the same way for an unsafe production
   config, and succeeds for the default development configuration
   with the placeholder secret in place — confirming compatibility
   with today's real `.env`.

   Subprocess execution (rather than in-process re-import) was
   necessary here: `app.core.config` is already cached in
   `sys.modules` by the time this test module itself runs under
   pytest, so an in-process re-import would not re-execute the
   module-level validation call and would not actually test the
   startup boundary.

Commands run and results, this sandbox (dependencies from
`requirements.txt` installed successfully here — `pypi.org` /
`files.pythonhosted.org` are reachable, unlike the V1-19/V1-20/V1-21
sandbox):

```
$ pytest tests/test_production_config_enforcement.py -v
14 passed

$ pytest tests/test_security.py tests/test_api.py \
         tests/test_production_config_enforcement.py -v
29 passed

$ pytest tests/ -q
1382 passed, 210 warnings in 46.91s
```

All `[EXECUTED]`. No test was skipped, weakened, or bypassed to make
the suite pass; the pre-existing 210 warnings are pre-existing
deprecation notices (SQLModel `.dict()`, anyio) unrelated to this
change.

## 10. Secret hygiene

- `.env` and `.env.example` are **byte-identical** — no drift, no
  real value introduced into either.
- No JWT signing key, API key, password, or private key was added to
  the repository. Grep for common real-secret shapes (`sk-...`, AWS
  access-key pattern, PEM headers) across `.env`, `.env.example`, and
  `app/` returned nothing.
- No secret value is printed anywhere in code, tests, or this report.

## 11. Backward compatibility

- Local/dev workflow (`APP_ENV` unset, `.env` as committed): unchanged
  — `app.main` imports and the app runs exactly as before.
- Test suite: unchanged — no test previously depended on the gap this
  closes, and none had to change to keep passing.
- Any *existing* production deployment that already set a real,
  non-placeholder, ≥32-character `SECRET_KEY` (the only way it could
  have started successfully under the pre-existing check, once the
  check began running) is unaffected. A deployment relying on the
  literal `.env.example` placeholder was never actually safe and will
  now correctly fail to start — this is the intended hardening, not a
  regression.

## 12. Remaining limitations

- `validate_production_settings` still only checks `secret_key` and
  no-ops on `database_url` (a deliberate pre-existing `pass` for
  sqlite-in-production, out of scope here).
- Placeholder detection is a `startswith("change-me")` heuristic, not
  an exhaustive deny-list; a differently-worded weak secret that
  happens to be ≥32 characters and doesn't start with "change-me"
  would still only be caught by the length check, same as before this
  change.
- No secrets-rotation, secrets-manager, or audit-logging capability
  was added or was in scope.

## 13. V1 release impact

This resolves the concrete "looks safe, isn't actually enforced"
release-readiness risk V1-20 flagged, and additionally closes a gap
V1-20 did not identify: the validator, once actually invoked, still
let the real shipped placeholder through. Both the wiring (already
present, now proven by tests) and the placeholder-detection gap (now
fixed) are covered by regression tests going forward.

## 14. Recommended next milestone

Add the same treatment (execution-backed source verification, then
regression tests) to the two other **`[SOURCE]`**-only V1-20
observability/CORS findings that were flagged but never actually
tested: (a) confirm `/docs`/`/redoc` truly 404 under
`app_env="production"`, and (b) assert security headers and CORS
rejection behavior with a real test client, rather than relying on
code inspection alone.

---

### V1-22 verdict

**PASS**

1. **Is production configuration now actually enforced?** Yes.
   `validate_production_settings()` was already invoked at the
   earliest practical startup boundary (module import of
   `app.core.config`, ahead of `FastAPI` app construction). What was
   *not* previously enforced was rejection of the actual placeholder
   value committed in `.env`/`.env.example`; that gap is now closed
   and covered by tests, verified by both direct calls and subprocess
   startup.
2. **Does development/test behavior remain compatible?** Yes — full
   suite: 1382 passed, 0 failed. No test needed modification.
3. **Were any secrets exposed or added?** No. `.env` and
   `.env.example` remain identical placeholders; no real secret
   appears anywhere in the diff or this report.
4. **What V1-20 release issue did this resolve?** The risk that a
   production deployment could start up and sign JWTs with a
   guessable/default `SECRET_KEY`. The originally-stated mechanism
   ("check is never called") was found to already be resolved in
   current source; the actual live mechanism — the check being called
   but not catching the real committed placeholder — is what this
   milestone fixed.
5. **What is the single next milestone?** Add execution-backed tests
   for the two remaining `[SOURCE]`-only V1-20 findings: production
   `/docs`/`/redoc` disabling and security-header/CORS enforcement.

### Changed files

- `backend/app/core/config.py` — modified (`validate_production_settings`
  placeholder-detection widened; no other line changed)
- `backend/tests/test_production_config_enforcement.py` — new (14 tests)
- `backend/docs/V1-22-production-config-hardening.md` — new (this document)

No other file was modified. `backend/docs/V1-20-release-readiness-audit.md`
and `backend/docs/V1-21-decompose-planning-contract-fix.md` were left
untouched, as instructed.
