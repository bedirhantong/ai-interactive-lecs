from fastapi import Response

from app.api.deps import SESSION_COOKIE
from app.core.config import Settings
from app.services.auth import IssuedSession


def set_session_cookie(response: Response, issued: IssuedSession, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        issued.token,
        httponly=True,  # not readable by JavaScript (also not by student Python in the browser)
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.session_ttl_hours * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
