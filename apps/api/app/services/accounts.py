"""Account provisioning: teachers create student accounts, admins create teacher accounts.

Students never give an email address. A teacher creates the account and hands
out a username + one-time password; the student must choose their own password
at first login. The one-time password is returned exactly once and stored only
as a hash.
"""

import uuid
from dataclasses import dataclass

from app.core.clock import Clock
from app.core.uow import UnitOfWork
from app.domain.audit import AuditAction
from app.domain.errors import Conflict, InvalidInput, NotFound, PermissionDenied, ServiceUnavailable
from app.domain.usernames import normalize_login, username_candidate
from app.models import MembershipStatus, Role, User
from app.repositories.classrooms import ClassroomRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.security.hashing import PasswordHasher
from app.security.tokens import new_one_time_password
from app.services.audit import AuditService
from app.services.classroom_access import ClassroomAccess

MAX_BULK = 40


@dataclass(frozen=True)
class ProvisionedAccount:
    user: User
    login: str
    one_time_password: str


def clean_display_name(name: str) -> str:
    name = " ".join(name.split())
    if not 1 <= len(name) <= 60:
        raise InvalidInput("Görünen ad 1–60 karakter olmalı.", code="invalid_display_name")
    return name


class AccountService:
    def __init__(
        self,
        users: UserRepository,
        classrooms: ClassroomRepository,
        sessions: SessionRepository,
        access: ClassroomAccess,
        audit: AuditService,
        hasher: PasswordHasher,
        clock: Clock,
        uow: UnitOfWork,
    ):
        self.users = users
        self.classrooms = classrooms
        self.sessions = sessions
        self.access = access
        self.audit = audit
        self.hasher = hasher
        self.clock = clock
        self.uow = uow

    def _unique_username(self, display_name: str) -> str:
        for _ in range(20):
            candidate = username_candidate(display_name)
            if not self.users.username_exists(candidate):
                return candidate
        raise ServiceUnavailable("Kullanıcı adı üretilemedi, tekrar dene.", code="username_unavailable")

    def create_students(self, teacher: User, classroom_id: int, display_names: list[str]) -> list[ProvisionedAccount]:
        """Create student accounts and add them to the teacher's classroom (already approved)."""
        room = self.access.owned(teacher, classroom_id)
        if not 1 <= len(display_names) <= MAX_BULK:
            raise InvalidInput(f"Tek seferde 1–{MAX_BULK} öğrenci eklenebilir.", code="invalid_batch_size")
        names = [clean_display_name(n) for n in display_names]
        created: list[ProvisionedAccount] = []
        for name in names:
            username = self._unique_username(name)
            password = new_one_time_password()
            user = self.users.add(
                User(
                    role=Role.student,
                    display_name=name,
                    username=username,
                    password_hash=self.hasher.hash(password),
                    must_change_password=True,
                    created_by_id=teacher.id,
                )
            )
            self.classrooms.add_membership(room.id, user.id, MembershipStatus.active)
            self.audit.record(AuditAction.STUDENT_ACCOUNT_CREATED, actor=teacher, subject_id=user.id, classroom_id=room.id)
            created.append(ProvisionedAccount(user=user, login=username, one_time_password=password))
        self.uow.commit()
        return created

    def reset_student_password(self, teacher: User, classroom_id: int, student_id: uuid.UUID) -> ProvisionedAccount:
        """New one-time password for a student in the teacher's classroom; signs the student out everywhere."""
        self.access.owned(teacher, classroom_id)
        self.access.active_member(classroom_id, student_id)
        student = self.users.get(student_id)
        if student is None or student.role != Role.student or student.is_demo or not student.username:
            raise NotFound("Bu öğrencinin şifresi buradan sıfırlanamaz.", code="student_not_resettable")
        password = new_one_time_password()
        student.password_hash = self.hasher.hash(password)
        student.must_change_password = True
        self.sessions.revoke_all_for_user(student.id, self.clock.now())
        self.audit.record(AuditAction.STUDENT_PASSWORD_RESET, actor=teacher, subject_id=student.id, classroom_id=classroom_id)
        self.uow.commit()
        return ProvisionedAccount(user=student, login=student.username, one_time_password=password)

    def delete_student(self, teacher: User, classroom_id: int, student_id: uuid.UUID) -> None:
        """Permanently delete a student account the teacher created (e.g. the student left the school).

        Only the creating teacher (or an admin) may do this; students who joined with a code
        own their accounts and delete them themselves.
        """
        self.access.owned(teacher, classroom_id)
        self.access.active_member(classroom_id, student_id)
        student = self.users.get(student_id)
        if student is None or student.role != Role.student:
            raise NotFound("Öğrenci bulunamadı.", code="student_not_found")
        if teacher.role != Role.admin and student.created_by_id != teacher.id:
            raise PermissionDenied("Yalnızca senin oluşturduğun öğrenci hesaplarını silebilirsin.", code="not_account_creator")
        self.audit.record(AuditAction.STUDENT_ACCOUNT_DELETED, actor=teacher, subject_id=student.id, classroom_id=classroom_id)
        self.users.delete(student)
        self.uow.commit()

    def create_teacher(self, email: str, display_name: str, created_by: User | None = None) -> ProvisionedAccount:
        email = normalize_login(email)
        if "@" not in email or len(email) > 254:
            raise InvalidInput("Geçerli bir e-posta adresi gir.", code="invalid_email")
        if self.users.email_exists(email):
            raise Conflict("Bu e-posta zaten kayıtlı.", code="email_taken")
        password = new_one_time_password()
        user = self.users.add(
            User(
                role=Role.teacher,
                email=email,
                display_name=clean_display_name(display_name),
                password_hash=self.hasher.hash(password),
                must_change_password=True,
                created_by_id=created_by.id if created_by else None,
            )
        )
        self.audit.record(AuditAction.TEACHER_ACCOUNT_CREATED, actor=created_by, subject_id=user.id)
        self.uow.commit()
        return ProvisionedAccount(user=user, login=email, one_time_password=password)
