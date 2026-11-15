# Shape Your Future - backend (FastAPI)
FROM python:3.12-slim AS base

WORKDIR /app

# No `apt-get` step here on purpose: it used to install `curl` just
# for the HEALTHCHECK below, which meant every build depended on
# Debian's package mirrors being reachable (they routinely aren't,
# behind some ISPs/firewalls, causing builds to fail with errors like
# "Could not connect to <mirror> - Connection refused" or, if someone
# hard-codes a single alternate mirror to work around that, the same
# failure the moment *that* mirror goes down or is blocked too).
# The HEALTHCHECK below uses Python's own urllib instead, which is
# already in this base image, so the build needs no OS packages and
# no network access beyond PyPI for requirements.txt.

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Runtime env defaults (override at `docker run`/compose time).
# SQLite lives on a named volume (see docker-compose.yml) so the DB
# survives container restarts; APP_ENV=development keeps /docs open
# and skips the production SECRET_KEY strength check, which is what
# V1-32 verification needs. SECRET_KEY is deliberately NOT set here: it is passed in at run time
# (compose reads it from `.env`). Do NOT reuse APP_ENV=development in a real
# deployment - see .env.example (repo root) and app/core/config.py.
ENV APP_ENV=development \
    DATABASE_URL=sqlite:////data/app.db \
    ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000 \
    PYTHONUNBUFFERED=1

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/healthz', timeout=2).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
