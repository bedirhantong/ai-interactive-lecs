"""Classroom roster: create, join with a code, approve, remove, assignments."""

import uuid

from app.core.uow import UnitOfWork
from app.domain.audit import AuditAction
from app.domain.errors import InvalidInput, NotFound, PermissionDenied, ServiceUnavailable
from app.models import Assignment, Classroom, ClassroomMembership, MembershipStatus, Role, User
from app.repositories.classrooms import ClassroomRepository
from app.security.tokens import new_join_code
from app.services.audit import AuditService
from app.services.classroom_access import ClassroomAccess
from app.services.content import Catalog


class ClassroomService:
    def __init__(self, classrooms: ClassroomRepository, access: ClassroomAccess, audit: AuditService, catalog: Catalog, uow: UnitOfWork):
        self.classrooms = classrooms
        self.access = access
        self.audit = audit
        self.catalog = catalog
        self.uow = uow

    def create(self, teacher: User, name: str) -> Classroom:
        name = " ".join(name.split())
        if not 1 <= len(name) <= 80:
            raise InvalidInput("Sınıf adı 1–80 karakter olmalı.", code="invalid_classroom_name")
        for _ in range(10):
            code = new_join_code()
            if not self.classrooms.join_code_exists(code):
                room = self.classrooms.add(Classroom(teacher_id=teacher.id, name=name, join_code=code))
                self.uow.commit()
                return room
        raise ServiceUnavailable("Sınıf kodu üretilemedi, tekrar dene.", code="join_code_unavailable")

    def list_for(self, user: User) -> list[Classroom]:
        if user.role in (Role.teacher, Role.admin):
            return self.classrooms.for_teacher(user.id)
        return self.classrooms.active_for_student(user.id)

    def join(self, student: User, code: str) -> MembershipStatus:
        """Join request by code: pending until the teacher approves. Reveals nothing about the class."""
        if student.role != Role.student:
            raise PermissionDenied("Sınıflara yalnızca öğrenciler katılabilir.")
        room = self.classrooms.by_join_code(code.strip().upper())
        if room is None:
            raise NotFound("Bu kodla bir sınıf bulunamadı.", code="join_code_not_found")
        membership = self.classrooms.membership(room.id, student.id)
        if membership is None:
            membership = self.classrooms.add_membership(room.id, student.id, MembershipStatus.pending)
            self.uow.commit()
        return membership.status

    def members(self, teacher: User, classroom_id: int) -> list[tuple[ClassroomMembership, User]]:
        self.access.owned(teacher, classroom_id)
        return self.classrooms.members(classroom_id)

    def approve(self, teacher: User, classroom_id: int, user_id: uuid.UUID) -> tuple[ClassroomMembership, User]:
        self.access.owned(teacher, classroom_id)
        membership = self.classrooms.membership(classroom_id, user_id)
        if membership is None:
            raise NotFound("Katılım isteği bulunamadı.", code="membership_not_found")
        membership.status = MembershipStatus.active
        self.audit.record(AuditAction.MEMBER_APPROVED, actor=teacher, subject_id=user_id, classroom_id=classroom_id)
        self.uow.commit()
        return membership, membership_user(self.classrooms, classroom_id, user_id)

    def remove_member(self, teacher: User, classroom_id: int, user_id: uuid.UUID) -> None:
        """Removes the student from the class (the account and its work are kept)."""
        self.access.owned(teacher, classroom_id)
        membership = self.classrooms.membership(classroom_id, user_id)
        if membership is None:
            raise NotFound("Öğrenci bu sınıfta değil.", code="student_not_in_classroom")
        self.classrooms.remove_membership(membership)
        self.audit.record(AuditAction.MEMBER_REMOVED, actor=teacher, subject_id=user_id, classroom_id=classroom_id)
        self.uow.commit()

    def add_assignment(self, teacher: User, classroom_id: int, lesson_id: str, due_at) -> Assignment:
        self.access.owned(teacher, classroom_id)
        if lesson_id not in self.catalog.lessons:
            raise InvalidInput("Bilinmeyen ders.", code="unknown_lesson")
        assignment = self.classrooms.add_assignment(Assignment(classroom_id=classroom_id, lesson_id=lesson_id, due_at=due_at))
        self.uow.commit()
        return assignment

    def assignments(self, user: User, classroom_id: int) -> list[Assignment]:
        self.access.can_view(user, classroom_id)
        return self.classrooms.assignments(classroom_id)


def membership_user(classrooms: ClassroomRepository, classroom_id: int, user_id: uuid.UUID) -> User:
    return next(u for m, u in classrooms.members(classroom_id) if u.id == user_id)
