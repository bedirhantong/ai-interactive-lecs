"""Domain errors: what went wrong, in business terms. No HTTP here.

Services raise these; the API layer (app/core/errors.py) is the only place
that knows how they map to HTTP status codes. Each error has a stable,
machine-readable `code` and a Turkish `message` that is safe to show users.
"""

from typing import Any


class DomainError(Exception):
    code = "error"
    message = "İstek işlenemedi."

    def __init__(self, message: str | None = None, *, code: str | None = None, details: list[dict[str, Any]] | None = None):
        self.code = code or type(self).code
        self.message = message or type(self).message
        self.details = details
        super().__init__(self.message)


class NotFound(DomainError):
    code, message = "not_found", "Aradığın kaynak bulunamadı."


class AuthenticationRequired(DomainError):
    code, message = "not_authenticated", "Oturum açman gerekiyor."


class InvalidCredentials(DomainError):
    code, message = "invalid_credentials", "Kullanıcı adı/e-posta ya da şifre hatalı."


class PermissionDenied(DomainError):
    code, message = "forbidden", "Bu işlem için yetkin yok."


class PasswordChangeRequired(PermissionDenied):
    code, message = "password_change_required", "Devam etmeden önce şifreni değiştirmelisin."


class InvalidInput(DomainError):
    code, message = "validation_error", "İstek geçersiz."


class Conflict(DomainError):
    code, message = "conflict", "İstek mevcut durumla çakışıyor."


class PreconditionRequired(DomainError):
    """An update must say which version it is based on (If-Match / If-None-Match)."""

    code, message = "precondition_required", "Bu kayıt hangi sürüme dayandığı belirtilmeden güncellenemez."


class PreconditionFailed(DomainError):
    """The client's version is not the current one: someone (another device) saved in between."""

    code, message = "revision_conflict", "Bu kayıt başka bir yerden değiştirilmiş. Güncel hâli alıp tekrar dene."


class PayloadTooLarge(DomainError):
    code, message = "payload_too_large", "Gönderilen veri çok büyük."


class RateLimited(DomainError):
    code, message = "rate_limited", "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene."

    def __init__(self, retry_after_seconds: int, message: str | None = None, *, code: str | None = None):
        super().__init__(message, code=code)
        self.retry_after_seconds = max(1, int(retry_after_seconds))


class ServiceUnavailable(DomainError):
    code, message = "unavailable", "Hizmet şu an kullanılamıyor."
