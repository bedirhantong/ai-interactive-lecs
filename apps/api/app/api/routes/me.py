"""Data subject rights (KVKK md. 11): see, correct, export and delete your own data."""

from typing import Annotated, Any

from fastapi import APIRouter, Query, Response

from app.api.cookies import clear_session_cookie
from app.api.deps import AuditSvc, CurrentUser, PrivacySvc
from app.api.schemas.auth import UserOut
from app.api.schemas.privacy import AccessLogEntryOut, AccountDeleteIn, ProfileUpdateIn
from app.core.responses import ERROR_RESPONSES, ApiResponse, Pagination, ok

router = APIRouter(prefix="/me", tags=["privacy"], responses=ERROR_RESPONSES)


@router.patch("", response_model=ApiResponse[UserOut], summary="Bilgilerimi düzelt")
def update_profile(body: ProfileUpdateIn, user: CurrentUser, privacy: PrivacySvc):
    changes = body.model_dump(include=body.model_fields_set)
    return ok(UserOut.of(privacy.update_profile(user, **changes)))


@router.get("/export", response_model=ApiResponse[dict[str, Any]], summary="Verilerimi indir")
def export(user: CurrentUser, privacy: PrivacySvc):
    """Everything the API stores about you, as one JSON document (`data`). Save it as a file."""
    return ok(privacy.export(user))


@router.get("/access-log", response_model=ApiResponse[list[AccessLogEntryOut]], summary="Verilerime kim, ne zaman erişti?")
def access_log(user: CurrentUser, audit: AuditSvc, cursor: int | None = None, limit: Annotated[int, Query(ge=1, le=100)] = 50):
    entries, next_cursor = audit.access_log(user, cursor=cursor, limit=limit)
    return ok([AccessLogEntryOut.of(e) for e in entries], pagination=Pagination(limit=limit, next_cursor=next_cursor))


@router.post("/delete", response_model=ApiResponse[None], summary="Hesabımı ve verilerimi kalıcı olarak sil")
def delete_account(body: AccountDeleteIn, user: CurrentUser, privacy: PrivacySvc, response: Response):
    """Irreversible. Notebooks, progress, reports, sessions and memberships are deleted with the account."""
    privacy.delete_account(user, body.password)
    clear_session_cookie(response)
    return ok(None)
