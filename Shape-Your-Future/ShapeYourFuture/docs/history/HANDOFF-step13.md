# HANDOFF step 13: repo hygiene, README, release zip

## Done
- Moved from the repo root to docs/history/: all HANDOFF*.md, existing-files-*.patch, MERGE-*.md, step12-deleted-files.txt.
- README.md rewritten: .env, Docker, local run, exact backend/frontend test commands, known 4 rate-limit failures.
- docker-compose.yml + backend/Dockerfile: comments pointed to the missing backend/.env.example -> now the root .env.example.
- .env.example: copy command, note on provider-specific keys. It matches every ${VAR} the compose file reads.
- No .env, *.db, dist, node_modules, caches in the release zip (empty .env and backend/app.db removed from the tree).
- .gitignore: added .venv/, venv/, tsconfig.tsbuildinfo.

## Left / assumptions
- AUDIT-crash-and-halfdone.md stays at the root (not in the requested move list).
- backend/docker-entrypoint.sh is not used by the Dockerfile (Hugging Face leftover): remove in a cleanup step.
- docker-compose keeps a fixed dev SECRET_KEY (development only).
