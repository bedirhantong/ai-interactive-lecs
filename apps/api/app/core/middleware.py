"""HTTP middleware: request context + access log, CSRF guard, security headers."""

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import Settings
from app.core.errors import INTERNAL_MESSAGE, error_response
from app.core.request_context import new_request_id, reset_request_id, set_request_id

access_log = logging.getLogger("app.access")
error_log = logging.getLogger("app.errors")

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CLIENT_HEADER = b"x-atolye-client"


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


class RequestContextMiddleware:
    """Assigns a request id, returns it as X-Request-ID, and writes one JSON access log line per request."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = new_request_id(_header(scope, b"x-request-id"))
        token = set_request_id(request_id)
        started = time.perf_counter()
        status = 500
        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status, response_started = message["status"], True
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            # Handled here (not by Starlette's outermost error middleware) so the 500
            # still carries the request id, security and CORS headers.
            error_log.exception("unhandled error", extra={"path": scope["path"]})
            if response_started:
                raise
            await error_response(500, "internal_error", INTERNAL_MESSAGE)(scope, receive, send_wrapper)
        finally:
            access_log.info(
                "request",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            reset_request_id(token)


class CsrfMiddleware:
    """Cookie sessions + CSRF defence.

    State-changing API requests must carry `x-atolye-client: 1` (a custom header
    forces a CORS preflight, which other sites cannot pass) and, if the browser
    sends an Origin, it must be one of the allowed origins.
    """

    def __init__(self, app: ASGIApp, settings: Settings, prefix: str):
        self.app = app
        self.origins = set(settings.origins)
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in UNSAFE_METHODS and scope["path"].startswith(self.prefix):
            origin = _header(scope, b"origin")
            if _header(scope, CLIENT_HEADER) != "1" or (origin and origin not in self.origins):
                response = error_response(403, "csrf_rejected", "İstek güvenlik kontrolünden geçemedi (CSRF koruması).")
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


class SecurityHeadersMiddleware:
    """Conservative headers for a JSON API. The interactive docs page needs scripts, so it gets no CSP."""

    def __init__(self, app: ASGIApp, settings: Settings):
        self.app = app
        self.hsts = settings.env == "production"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_docs = scope["path"].startswith(("/docs", "/openapi.json"))

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                existing = {k.lower() for k, _ in headers}
                extra = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                    (b"cross-origin-opener-policy", b"same-origin"),
                ]
                if not is_docs:
                    extra += [
                        (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
                        (b"cache-control", b"no-store"),  # responses can contain personal data
                    ]
                if self.hsts:
                    extra.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                headers.extend((k, v) for k, v in extra if k not in existing)
            await send(message)

        await self.app(scope, receive, send_wrapper)
