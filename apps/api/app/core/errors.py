"""Maps errors to the error envelope. The only place that knows HTTP status codes for domain errors.

    {"success": false, "error": {"code": "classroom_not_found", "message": "Sınıf bulunamadı.", "request_id": "…", "details": [...]}}

- `code` is stable and machine-readable: clients branch on it, never on the message.
- `message` is Turkish and safe to show to students.
- `request_id` matches the X-Request-ID header and the server logs.
- Internal errors never leak exception text or stack traces (see RequestContextMiddleware).
"""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.request_context import get_request_id
from app.domain import errors as domain

INTERNAL_MESSAGE = "Beklenmeyen bir hata oluştu. Sorun sürerse bu istek kimliğini paylaş."

# Most specific class first.
STATUS_BY_ERROR: list[tuple[type[domain.DomainError], int]] = [
    (domain.NotFound, 404),
    (domain.AuthenticationRequired, 401),
    (domain.InvalidCredentials, 401),
    (domain.PermissionDenied, 403),
    (domain.InvalidInput, 422),
    (domain.Conflict, 409),
    (domain.PayloadTooLarge, 413),
    (domain.PreconditionFailed, 412),
    (domain.PreconditionRequired, 428),
    (domain.RateLimited, 429),
    (domain.ServiceUnavailable, 503),
]

DEFAULT_CODES = {
    400: ("bad_request", "İstek hatalı."),
    401: ("not_authenticated", "Oturum açman gerekiyor."),
    403: ("forbidden", "Bu işlem için yetkin yok."),
    404: ("not_found", "Aradığın kaynak bulunamadı."),
    405: ("method_not_allowed", "Bu işlem bu adreste desteklenmiyor."),
    409: ("conflict", "İstek mevcut durumla çakışıyor."),
    412: ("revision_conflict", "Kayıt başka bir yerden değiştirilmiş."),
    428: ("precondition_required", "Kaydın sürümü belirtilmeli (If-Match)."),
    413: ("payload_too_large", "Gönderilen veri çok büyük."),
    422: ("validation_error", "İstek geçersiz."),
    429: ("rate_limited", "Çok fazla istek gönderildi. Biraz bekleyip tekrar dene."),
    503: ("unavailable", "Hizmet şu an kullanılamıyor."),
}


def status_for(error: domain.DomainError) -> int:
    return next((status for cls, status in STATUS_BY_ERROR if isinstance(error, cls)), 400)


def error_response(status_code: int, code: str, message: str, details: list[Any] | None = None, headers=None) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message, "request_id": get_request_id()}
    if details:
        body["details"] = details
    return JSONResponse({"success": False, "error": body}, status_code=status_code, headers=headers)


def _validation_details(errors: list[dict]) -> list[dict]:
    # Never echo the input back (it may contain personal data or large payloads).
    return [{"field": ".".join(str(p) for p in e.get("loc", ())), "message": e.get("msg", ""), "type": e.get("type", "")} for e in errors[:20]]


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(domain.DomainError)
    async def _domain_error(_: Request, exc: domain.DomainError) -> JSONResponse:
        headers = {"Retry-After": str(exc.retry_after_seconds)} if isinstance(exc, domain.RateLimited) else None
        return error_response(status_for(exc), exc.code, exc.message, exc.details, headers=headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code, message = DEFAULT_CODES.get(exc.status_code, ("http_error", "İstek işlenemedi."))
        if isinstance(exc.detail, str) and exc.status_code < 500 and exc.detail not in ("Not Found", "Method Not Allowed"):
            message = exc.detail
        return error_response(exc.status_code, code, message, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(422, "validation_error", "İstek geçersiz.", _validation_details(list(exc.errors())))

    # Unexpected exceptions are turned into a 500 "internal_error" by
    # RequestContextMiddleware, so the response keeps its request id and headers.
