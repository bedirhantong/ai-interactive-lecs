"""Who may touch which classroom. Shared by every service that deals with classrooms."""

import uuid

from app.domain.errors import NotFound
from app.models import Classroom, ClassroomMembership, MembershipStatus, Role, User
from app.repositories.classrooms import ClassroomRepository

CLASSROOM_NOT_FOUND = "classroom_not_found"


class ClassroomAccess:
    def __init__(self, classrooms: ClassroomRepository):
        self.classrooms = classrooms

    def owned(self, teacher: User, classroom_id: int) -> Classroom:
        """Teachers manage only their own classrooms (admins: any). Others' classrooms look like they don't exist."""
        room = self.classrooms.get(classroom_id)
        if room is None or (teacher.role != Role.admin and room.teacher_id != teacher.id):
            raise NotFound("Sınıf bulunamadı.", code=CLASSROOM_NOT_FOUND)
        return room

    def active_member(self, classroom_id: int, user_id: uuid.UUID) -> ClassroomMembership:
        membership = self.classrooms.membership(classroom_id, user_id)
        if membership is None or membership.status != MembershipStatus.active:
            raise NotFound("Öğrenci bu sınıfta değil.", code="student_not_in_classroom")
        return membership

    def can_view(self, user: User, classroom_id: int) -> Classroom:
        """Owner teacher (or admin), or an approved student member."""
        if user.role in (Role.teacher, Role.admin):
            return self.owned(user, classroom_id)
        room = self.classrooms.get(classroom_id)
        membership = self.classrooms.membership(classroom_id, user.id)
        if room is None or membership is None or membership.status != MembershipStatus.active:
            raise NotFound("Sınıf bulunamadı.", code=CLASSROOM_NOT_FOUND)
        return room
