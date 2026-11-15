# HANDOFF security step 1: secrets cleanup

## Changed
- docs/history/HANDOFF-part24.md: key fragment -> <REDACTED> (it was the only real key fragment in the project).
- backend/app/core/config.py: SECRET_KEY only from env; blank -> labelled DEV_SECRET_KEY (warning logged in dev);
  production refuses missing/blank, any known dev or placeholder value, "change-me*"/"dev-only*"/"docker-dev*" and < 32 chars.
- docker-compose.yml: hard-coded SECRET_KEY removed (`${SECRET_KEY:-}`), `APP_ENV: ${APP_ENV:-development}`.
- backend/Dockerfile: SECRET_KEY removed from ENV.
- .env.example: placeholders only; new APP_ENV and SECRET_KEY entries with generation command.
- .gitignore + root/backend/frontend .dockerignore: .env, .env.*, *.db, *.sqlite*, *.pem, *.key, *.p12, *.pfx, secrets/.
- backend/docker-entrypoint.sh deleted (referenced only by docs, never by Dockerfile or compose).
- Tests: tests/test_secret_hygiene.py (new), tests/test_production_config_enforcement.py (3 more rejected values).
- README.md, AUDIT.md (rows 1, 7, 15) updated.

## Checks
pytest RUN: 1255 pass, 4 fail (known rate-limit tests, unchanged). Docker build/up NOT RUN. Frontend untouched, not re-run.

## By hand
Revoke the old key; revoke the key pasted in chat; set SECRET_KEY in .env for any shared/production run.
