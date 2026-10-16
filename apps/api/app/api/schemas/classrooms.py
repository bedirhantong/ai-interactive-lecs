from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.models import Assignment, Classroom, ClassroomMembership, MembershipStatus, User


class ClassroomIn(BaseModel):
    name: Annotated[str, StringConstraints(min_length=1, max_length=80, strip_whitespace=True)]


class ClassroomOut(BaseModel):
    id: int
    name: str
    join_code: str | None  # only the teacher sees the code

    @classmethod
    def of(cls, room: Classroom, *, show_code: bool) -> "ClassroomOut":
        return cls(id=room.id, name=room.name, join_code=room.join_code if show_code else None)


class JoinIn(BaseModel):
    code: Annotated[str, StringConstraints(min_length=6, max_length=12, strip_whitespace=True, to_upper=True)]


class JoinOut(BaseModel):
    status: MembershipStatus


class MemberOut(BaseModel):
    user_id: str
    display_name: str
    username: str | None
    status: MembershipStatus

    @classmethod
    def of(cls, membership: ClassroomMembership, user: User) -> "MemberOut":
        return cls(user_id=str(user.id), display_name=user.display_name, username=user.username, status=membership.status)


class AssignmentIn(BaseModel):
    lesson_id: Annotated[str, StringConstraints(max_length=80)]
    due_at: datetime | None = None


class AssignmentOut(BaseModel):
    id: int
    lesson_id: str
    due_at: datetime | None

    @classmethod
    def of(cls, a: Assignment) -> "AssignmentOut":
        return cls(id=a.id, lesson_id=a.lesson_id, due_at=a.due_at)


class StudentSummaryOut(BaseModel):
    user_id: str
    display_name: str
    username: str | None
    status: MembershipStatus
    last_activity_at: datetime | None
    completed_lessons: list[str]
    challenges_passed: int
    reports: int
    latest_test_accuracy: float | None

    @classmethod
    def of(cls, s) -> "StudentSummaryOut":
        return cls(
            user_id=str(s.user.id),
            display_name=s.user.display_name,
            username=s.user.username,
            status=s.status,
            last_activity_at=s.last_activity_at,
            completed_lessons=s.completed_lessons,
            challenges_passed=s.challenges_passed,
            reports=s.reports,
            latest_test_accuracy=s.latest_test_accuracy,
        )


class ReflectionOut(BaseModel):
    lesson_id: str
    cell_id: str
    text: str
    submitted_at: str | None
