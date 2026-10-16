"""Dependency injection: the composition root of the API.

This is the only module that decides which concrete classes are used. Routes
ask for services; services receive repositories and collaborators through
their constructors. Tests replace pieces with `app.dependency_overrides`
(e.g. a fake clock), without touching routes or services.
"""

from functools import lru_cache
from typing import Annotated

from fastapi import Cookie, Depends, Request
from sqlalchemy.orm import Session

from app.core.clock import Clock, SystemClock
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.domain.errors import PasswordChangeRequired, PermissionDenied
from app.models import Role, User
from app.repositories.attempts import AttemptRepository
from app.repositories.audit import AuditRepository
from app.repositories.classrooms import ClassroomRepository
from app.repositories.notebooks import NotebookRepository
from app.repositories.progress import ProgressRepository
from app.repositories.reports import ReportRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.security.hashing import PasswordHasher, ScryptHasher
from app.security.tokens import KeyedHasher
from app.services.accounts import AccountService
from app.services.audit import AuditService
from app.services.auth import AuthContext, AuthService
from app.services.classroom_access import ClassroomAccess
from app.services.classrooms import ClassroomService
from app.services.content import Catalog, get_catalog
from app.services.notebooks import NotebookService
from app.services.privacy import PrivacyService
from app.services.progress import ProgressService
from app.services.rate_limiter import AttemptLimiter
from app.services.reports import ReportService
from app.services.review import ReviewService

SESSION_COOKIE = "atolye_session"

# --- infrastructure ---------------------------------------------------------------

DB = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_clock() -> Clock:
    return SystemClock()


@lru_cache
def _scrypt() -> ScryptHasher:
    return ScryptHasher()


def get_password_hasher() -> PasswordHasher:
    return _scrypt()


def get_keyed_hasher(settings: SettingsDep) -> KeyedHasher:
    return KeyedHasher(settings.secret_key.get_secret_value())


def get_content_catalog() -> Catalog:
    return get_catalog()


ClockDep = Annotated[Clock, Depends(get_clock)]
HasherDep = Annotated[PasswordHasher, Depends(get_password_hasher)]
CatalogDep = Annotated[Catalog, Depends(get_content_catalog)]


def client_ip(request: Request) -> str:
    """Behind a reverse proxy, run uvicorn with --proxy-headers so this is the real client address."""
    return request.client.host if request.client else "unknown"


# --- services -----------------------------------------------------------------------


def get_auth_service(
    db: DB, clock: ClockDep, hasher: HasherDep, settings: SettingsDep, keyed: Annotated[KeyedHasher, Depends(get_keyed_hasher)]
) -> AuthService:
    limiter = AttemptLimiter(AttemptRepository(db), keyed, clock, settings)
    return AuthService(UserRepository(db), SessionRepository(db), limiter, hasher, clock, settings, db)


def get_audit_service(db: DB, clock: ClockDep) -> AuditService:
    return AuditService(AuditRepository(db), clock)


AuditSvc = Annotated[AuditService, Depends(get_audit_service)]


def get_account_service(db: DB, clock: ClockDep, hasher: HasherDep, audit: AuditSvc) -> AccountService:
    classrooms = ClassroomRepository(db)
    return AccountService(UserRepository(db), classrooms, SessionRepository(db), ClassroomAccess(classrooms), audit, hasher, clock, db)


def get_classroom_service(db: DB, catalog: CatalogDep, audit: AuditSvc) -> ClassroomService:
    classrooms = ClassroomRepository(db)
    return ClassroomService(classrooms, ClassroomAccess(classrooms), audit, catalog, db)


def get_review_service(db: DB, audit: AuditSvc) -> ReviewService:
    classrooms = ClassroomRepository(db)
    return ReviewService(ClassroomAccess(classrooms), classrooms, ProgressRepository(db), ReportRepository(db), NotebookRepository(db), audit, db)


def get_privacy_service(db: DB, clock: ClockDep, hasher: HasherDep, audit: AuditSvc) -> PrivacyService:
    return PrivacyService(
        UserRepository(db),
        SessionRepository(db),
        NotebookRepository(db),
        ProgressRepository(db),
        ReportRepository(db),
        ClassroomRepository(db),
        audit,
        hasher,
        clock,
        db,
    )


def get_notebook_service(db: DB, catalog: CatalogDep, settings: SettingsDep, clock: ClockDep) -> NotebookService:
    return NotebookService(NotebookRepository(db), catalog, settings, clock, db)


def get_progress_service(db: DB, catalog: CatalogDep) -> ProgressService:
    return ProgressService(ProgressRepository(db), catalog, db)


def get_report_service(db: DB, catalog: CatalogDep, settings: SettingsDep) -> ReportService:
    return ReportService(ReportRepository(db), catalog, settings, db)


AuthSvc = Annotated[AuthService, Depends(get_auth_service)]
AccountSvc = Annotated[AccountService, Depends(get_account_service)]
ClassroomSvc = Annotated[ClassroomService, Depends(get_classroom_service)]
ReviewSvc = Annotated[ReviewService, Depends(get_review_service)]
NotebookSvc = Annotated[NotebookService, Depends(get_notebook_service)]
ProgressSvc = Annotated[ProgressService, Depends(get_progress_service)]
ReportSvc = Annotated[ReportService, Depends(get_report_service)]
PrivacySvc = Annotated[PrivacyService, Depends(get_privacy_service)]

# --- authentication & authorization ---------------------------------------------------


def session_context(service: AuthSvc, atolye_session: Annotated[str | None, Cookie()] = None) -> AuthContext:
    """Any valid session, including one that still has to change its one-time password."""
    return service.authenticate(atolye_session)


def active_context(ctx: Annotated[AuthContext, Depends(session_context)]) -> AuthContext:
    """A valid session whose user may use the platform (password already changed if required)."""
    if ctx.user.must_change_password:
        raise PasswordChangeRequired()
    return ctx


def current_user(ctx: Annotated[AuthContext, Depends(active_context)]) -> User:
    return ctx.user


def require_roles(*roles: Role):
    def check(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise PermissionDenied()
        return user

    return check


SessionCtx = Annotated[AuthContext, Depends(session_context)]
CurrentUser = Annotated[User, Depends(current_user)]
TeacherUser = Annotated[User, Depends(require_roles(Role.teacher, Role.admin))]
AdminUser = Annotated[User, Depends(require_roles(Role.admin))]
