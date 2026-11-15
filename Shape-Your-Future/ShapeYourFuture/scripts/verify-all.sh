#!/usr/bin/env bash
# Runs every automated check and writes the REAL summary lines to verify-report.txt.
# Usage (project root):  bash scripts/verify-all.sh
# Needs: Python 3.12, Node 20+ (22 works), network for pip/npm. Does not need Docker.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/verify-report.txt"
: > "$REPORT"
log() { echo "$*" | tee -a "$REPORT"; }

log "== verify-all $(date -u +%FT%TZ)  python=$(python3 --version 2>&1)  node=$(node --version 2>&1)"

cd "$ROOT/backend"
[ -d .venv ] || python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
log "-- pip install"
pip install -q -r requirements.txt 2>&1 | tail -3 | tee -a "$REPORT"
log "-- backend pytest (last line is the summary)"
python -m pytest -q 2>&1 | tail -15 | tee -a "$REPORT"
log "-- backend: pytest exit code ${PIPESTATUS[0]}"
log "-- backend compileall"
python -m compileall -q app scripts tests && log "compileall ok"
log "-- backend lint (ruff, if available)"
pip install -q ruff 2>&1 | tail -1
ruff check app scripts tests 2>&1 | tail -15 | tee -a "$REPORT"
deactivate

cd "$ROOT/frontend"
log "-- npm ci"
npm ci 2>&1 | tail -3 | tee -a "$REPORT"
log "-- tsc --noEmit";  npx tsc --noEmit 2>&1 | tail -15 | tee -a "$REPORT"; log "tsc exit ${PIPESTATUS[0]}"
log "-- build";         npm run build 2>&1 | tail -6 | tee -a "$REPORT"
log "-- check:i18n";    npm run check:i18n 2>&1 | tail -5 | tee -a "$REPORT"
log "-- vitest";        npx vitest run 2>&1 | tail -12 | tee -a "$REPORT"
log "== done. Paste verify-report.txt into AUDIT.md section 2."
