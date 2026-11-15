import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from app.api.routes import auth, coach, conversation, daily_entry, profile
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.core.request_context import (
    generate_request_id,
    is_valid_request_id,
    reset_request_id,
    set_request_id,
)
from app.db.database import init_db
from app.llm.provider import LLMNotConfigured, is_llm_configured

setup_logging()
logger = logging.getLogger("maketime")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Shape Your Future API",
    version="0.1.0",
    lifespan=lifespan,
    # Hide interactive docs in production - they reveal the whole schema
    # surface to anyone; keep them for local/dev only.
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Explicit allow-list only - never "*" once real user data is involved.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],  # no route uses DELETE any more
    allow_headers=["Authorization", "Content-Type", "X-Timezone"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    # Correlation ID for this request: reuse a valid client-supplied
    # X-Request-ID, otherwise generate one. Stored in a contextvar (see
    # app/core/request_context.py) rather than a global, so it's safe
    # under concurrent requests, and picked up automatically by
    # RequestIdLogFilter for any log emitted while handling this request
    # - including from the unhandled-exception handler below.
    incoming = request.headers.get("X-Request-ID")
    request_id = incoming if incoming and is_valid_request_id(incoming) else generate_request_id()
    request.state.request_id = request_id
    token = set_request_id(request_id)
    try:
        response = await call_next(request)
    finally:
        reset_request_id(token)
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never leak stack traces / internal exception text to the client -
    # log it server-side with an id, return a generic message.
    #
    # Starlette installs the handler registered for the bare `Exception`
    # class as ServerErrorMiddleware's error handler, which sits OUTSIDE
    # every middleware added via add_middleware/@app.middleware("http")
    # (CORS, request_id_middleware, security_headers) - see
    # Starlette's `build_middleware_stack`. A response built here never
    # passes back through those middlewares, so it would not otherwise
    # carry X-Request-ID. We attach it explicitly, reading the id from
    # `request.state` (set by request_id_middleware before the failing
    # call, so it's still valid here) rather than the contextvar, which
    # request_id_middleware's `finally` block has already reset by the
    # time an exception has unwound this far.
    request_id = getattr(request.state, "request_id", None) or generate_request_id()
    logger.exception(
        "unhandled_error path=%s", request.url.path, extra={"request_id": request_id}
    )
    response = JSONResponse(status_code=500, content={"detail": "خطای داخلی سرور رخ داد"})
    response.headers["X-Request-ID"] = request_id
    # This handler runs OUTSIDE CORSMiddleware, so without these headers the
    # browser hides every 500 behind a misleading "blocked by CORS policy"
    # error instead of showing the real server error. Add them manually for
    # allow-listed origins only.
    origin = request.headers.get("origin")
    if origin and origin in settings.cors_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    return response


@app.exception_handler(LLMNotConfigured)
async def llm_not_configured_handler(request: Request, exc: LLMNotConfigured):
    # A missing key/base URL is a deployment problem, not a bug in the request: answer 503 with a stable
    # machine-readable code instead of a generic 500. The exception text (it names an env var) is logged,
    # never sent. Registered for this class, so it runs inside the middleware stack: the CORS and
    # X-Request-ID headers are added the normal way (unlike the bare-Exception handler above).
    logger.error("llm_not_configured path=%s reason=%s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "سرویس هوش مصنوعی در دسترس نیست", "code": "llm_not_configured"},
    )


app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(daily_entry.router)
app.include_router(coach.router)
app.include_router(conversation.router)


@app.get("/healthz")
def healthz():
    return {"status": "ok", "env": settings.app_env, "llm_configured": is_llm_configured()}


# ---- Static frontend (built by the root Dockerfile's node stage) ----
# Mounted LAST and at "/" on purpose: FastAPI matches routes in the order
# they're registered, so the API routes above (/auth, /profile, /daily-entry, /coach) always win before this
# catch-all ever sees the request. html=True makes unknown sub-paths (e.g.
# a client-side route) fall back to index.html instead of 404ing, which is
# what a single-page app needs.
_static_dir = Path(__file__).parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
else:
    logger.warning("no frontend build found at %s - API-only mode", _static_dir)
