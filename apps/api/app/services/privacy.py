"""Data subject rights (KVKK md. 11): access (export), rectification (profile), erasure (delete account)."""

from datetime import UTC
from typing import Any

from app.core.clock import Clock
from app.core.uow import UnitOfWork
from app.domain.audit import AuditAction
from app.domain.errors import InvalidCredentials, InvalidInput
from app.models import Role, User
from app.repositories.classrooms import ClassroomRepository
from app.repositories.notebooks import NotebookRepository
from app.repositories.progress import ProgressRepository
from app.repositories.reports import ReportRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.security.hashing import PasswordHasher
from app.services.accounts import clean_display_name
from app.services.audit import AuditService

AGE_BANDS = ("11-13", "14-15", "16-18")
EXPORT_FORMAT_VERSION = 1
UNSET: Any = object()


def _iso(value) -> str | None:
    if value is None:
        return None
    return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


class PrivacyService:
    def __init__(
        self,
        users: UserRepository,
        sessions: SessionRepository,
        notebooks: NotebookRepository,
        progress: ProgressRepository,
        reports: ReportRepository,
        classrooms: ClassroomRepository,
        audit: AuditService,
        hasher: PasswordHasher,
        clock: Clock,
        uow: UnitOfWork,
    ):
        self.users = users
        self.sessions = sessions
        self.notebooks = notebooks
        self.progress = progress
        self.reports = reports
        self.classrooms = classrooms
        self.audit = audit
        self.hasher = hasher
        self.clock = clock
        self.uow = uow

    # --- access -------------------------------------------------------------------------

    def export(self, user: User) -> dict[str, Any]:
        """Everything the API stores about this person, in one machine-readable document."""
        creator = self.users.get(user.created_by_id) if user.created_by_id else None
        access_log, _ = self.audit.access_log(user, cursor=None, limit=1000)
        document = {
            "format_version": EXPORT_FORMAT_VERSION,
            "exported_at": _iso(self.clock.now()),
            "account": {
                "id": str(user.id),
                "role": user.role,
                "display_name": user.display_name,
                "username": user.username,
                "email": user.email,
                "age_band": user.age_band,
                "is_demo": user.is_demo,
                "created_at": _iso(user.created_at),
                "created_by": {"display_name": creator.display_name, "role": creator.role} if creator else None,
                "last_login_at": _iso(user.last_login_at),
                "password_changed_at": _iso(user.password_changed_at),
            },
            "sessions": [
                {"created_at": _iso(s.created_at), "expires_at": _iso(s.expires_at), "revoked_at": _iso(s.revoked_at)}
                for s in self.sessions.for_user(user.id)
            ],
            "notebooks": [
                {"lesson_id": n.lesson_id, "lesson_version": n.lesson_version, "updated_at": _iso(n.updated_at), "state": n.state}
                for n in self.notebooks.for_user(user.id)
            ],
            "progress_events": [
                {
                    "lesson_id": e.lesson_id,
                    "cell_id": e.cell_id,
                    "kind": e.kind,
                    "detail": e.detail,
                    "occurred_at": _iso(e.occurred_at),
                    "verification": e.verification,
                }
                for e in self.progress.all_for_user(user.id)
            ],
            "training_reports": [
                {
                    "lesson_id": r.lesson_id,
                    "created_at": _iso(r.created_at),
                    "verification": r.verification,
                    "teacher_note": r.teacher_note,
                    "report": r.report,
                }
                for r in self.reports.all_for_user(user.id)
            ],
            "classroom_memberships": [
                {"classroom": c.name, "status": m.status, "since": _iso(m.created_at)} for m, c in self.classrooms.memberships_for_user(user.id)
            ],
            "owned_classrooms": [
                {"name": c.name, "join_code": c.join_code, "created_at": _iso(c.created_at), "member_count": self.classrooms.member_count(c.id)}
                for c in self.classrooms.for_teacher(user.id)
            ],
            "access_log": [
                {"action": e.action, "description": e.description, "by": e.actor_name, "by_role": e.actor_role, "at": _iso(e.at)} for e in access_log
            ],
            "not_included": [
                "Şifren: yalnızca geri döndürülemez bir özeti (hash) saklanır.",
                "Giriş denemeleri: yalnızca anahtarlı özet olarak saklanır ve sana bağlanamaz; 7 gün sonra silinir.",
                "Sınıfındaki diğer öğrencilerin verileri: onlara aittir.",
                "Tarayıcında saklanan demo verileri: AI Atölye uygulamasındaki Profil sayfasından indirebilirsin.",
            ],
        }
        self.audit.record(AuditAction.DATA_EXPORTED, actor=user, subject_id=user.id)
        self.uow.commit()
        return document

    # --- rectification ------------------------------------------------------------------

    def update_profile(self, user: User, *, display_name: str | None = UNSET, age_band: str | None = UNSET) -> User:
        if display_name is not UNSET and display_name is not None:
            user.display_name = clean_display_name(display_name)
        if age_band is not UNSET:
            if age_band is not None and age_band not in AGE_BANDS:
                raise InvalidInput("Yaş aralığı 11-13, 14-15 ya da 16-18 olmalı.", code="invalid_age_band")
            user.age_band = age_band
        self.audit.record(AuditAction.PROFILE_UPDATED, actor=user, subject_id=user.id)
        self.uow.commit()
        return user

    # --- erasure ------------------------------------------------------------------------

    def delete_account(self, user: User, password: str | None) -> None:
        """Permanently deletes the account and everything that belongs to it (database cascades).

        Teachers: their classrooms and assignments are deleted too; student accounts they created
        are kept (those belong to the students). Audit events stay, but no longer identify the person.
        """
        if user.password_hash and not self.hasher.verify(password or "", user.password_hash):
            raise InvalidCredentials("Hesabı silmek için şifreni doğru girmelisin.", code="invalid_current_password")
        if user.role == Role.admin:
            raise InvalidInput("Yönetici hesapları buradan silinemez.", code="admin_not_deletable")
        self.audit.record(AuditAction.ACCOUNT_DELETED, actor=user, subject_id=user.id)
        self.users.delete(user)
        self.uow.commit()
