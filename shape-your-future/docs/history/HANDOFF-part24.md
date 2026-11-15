# Part 24 - Step 1: baseline hygiene (no production logic changed)

## What changed
- `docker-compose.yml`: `LLM_API_KEY` is now `${LLM_API_KEY:-}`. The hard-coded default key is gone; the key comes only from `.env`. Nothing else in the file changed (a one-line comment was added above it).
- `.gitignore`: `.env` was already listed. Added `.env.*` and `!.env.example` so variants (`.env.local`, `.env.production`) are ignored but the template stays tracked.
- `.dockerignore` (NEW, repo root): ignores `.env`, `.env.*` (keeps `.env.example`), `.git/`, `node_modules/`, `dist/`, caches, `*.db`. `backend/.dockerignore` and `frontend/.dockerignore` already ignored `.env` and are unchanged.
- `.env.example` (NEW, repo root): every variable docker-compose.yml reads, with empty values (empty = compose default, because the compose file uses `:-`).
- `README.md` (NEW; the repo had none): overview, `.env` setup, Docker run, and the exact test commands.

## Delivered files (full content, same paths as the repo)
1. `docker-compose.yml`
2. `.gitignore`
3. `.dockerignore`
4. `.env.example`
5. `README.md`
6. `HANDOFF-part24.md`

## Checks run
- `docker-compose.yml` parses as valid YAML; `LLM_API_KEY` resolves to `${LLM_API_KEY:-}`.
- No `sk-` string remains in the delivered files.
- Confirmed the README commands match `frontend/package.json` scripts (`build`, `check:i18n`) and that `vite-node` (used by `check:i18n`) is in `package-lock.json`.
- Confirmed an empty `LLM_API_KEY` gives a clear error from `provider._require` instead of using a wrong key.

## Not verified
- `pytest`, `npx tsc --noEmit`, `npm run build`, `npm run check:i18n`, `npx vitest run`: NOT run. This sandbox has no network, so Python deps and `node_modules` cannot be installed. The README commands are therefore documented from the repo's config, not from a green run on my side.
- `docker compose up` / `docker compose config`: Docker is not available here.
- Not checked: that the Python dependencies install on your Python version; the README assumes 3.12 (the Dockerfile's version).
- `docker-compose.yml` still says "see backend/.env.example". That file is not in the uploaded zip; I left the comment alone because the step said no other edits. The new root `.env.example` is the one to use.

## SECURITY - action needed from you
- The removed key (<REDACTED>) is still in every earlier copy of `docker-compose.yml`: git history, earlier zips, anything shared. Removing it from the file does not make it safe. **Rotate/revoke it at the provider (gapgpt) and put the new key only in `.env`.**
- The `.env` in the zip is empty (0 bytes); I did not touch it. If you already had a real `.env`, keep it as is: `docker compose` reads it automatically.
- If the repo is already under git, check that no `.env` was committed: `git ls-files | grep -E '(^|/)\.env$'` (must print nothing).

## Git commit message
`Remove hard-coded LLM key default from compose; add .env.example, root .dockerignore and test commands to README`
