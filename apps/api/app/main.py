"""AI Atölye API.

Deliberately thin: it stores and authorizes data. It never executes student
code: Python runs in the student's browser (Pyodide) or in their own Google
Colab session. There is no execution endpoint and there must never be one.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import accounts, auth, classrooms, content, health, me, notebooks, progress, reports
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import setup_logging
from app.core.middleware import CLIENT_HEADER, CsrfMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware
from app.core.responses import ApiResponse, ok

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)
    app = FastAPI(
        title="AI Atölye API",
        version="0.5.0",
        docs_url=None if settings.env == "production" else "/docs",
        redoc_url=None,
        openapi_url=None if settings.env == "production" else "/openapi.json",
    )
    install_error_handlers(app)

    # Added inner → outer. Request order: CORS → security headers → request context (id, access log,
    # 500 handling) → CSRF → routes. Every response, including errors, gets all of these.
    app.add_middleware(CsrfMiddleware, settings=settings, prefix=API_PREFIX)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(SecurityHeadersMiddleware, settings=settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["content-type", CLIENT_HEADER.decode(), "x-request-id", "if-match", "if-none-match"],
        expose_headers=["x-request-id", "etag", "retry-after"],
    )

    # Kept for compatibility: same as /health/live plus the demo flag.
    @app.get(f"{API_PREFIX}/health", tags=["health"], response_model=ApiResponse[dict])
    def health_compat():
        return ok({"status": "ok", "demo_mode": settings.demo_mode})

    for router in (
        health.router,
        auth.router,
        me.router,
        accounts.router,
        content.router,
        notebooks.router,
        progress.router,
        reports.router,
        classrooms.router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
