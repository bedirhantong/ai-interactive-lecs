import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Assignment, Classroom, ClassroomMembership, MembershipStatus, User


class ClassroomRepository:
    def __init__(self, db: Session):
        self.db = db

    # classrooms
    def get(self, classroom_id: int) -> Classroom | None:
        return self.db.get(Classroom, classroom_id)

    def by_join_code(self, code: str) -> Classroom | None:
        return self.db.scalar(select(Classroom).where(Classroom.join_code == code))

    def join_code_exists(self, code: str) -> bool:
        return self.db.scalar(select(Classroom.id).where(Classroom.join_code == code)) is not None

    def add(self, classroom: Classroom) -> Classroom:
        self.db.add(classroom)
        self.db.flush()
        return classroom

    def for_teacher(self, teacher_id: uuid.UUID) -> list[Classroom]:
        return list(self.db.scalars(select(Classroom).where(Classroom.teacher_id == teacher_id).order_by(Classroom.id)))

    def active_for_student(self, user_id: uuid.UUID) -> list[Classroom]:
        return list(
            self.db.scalars(
                select(Classroom)
                .join(ClassroomMembership, ClassroomMembership.classroom_id == Classroom.id)
                .where(ClassroomMembership.user_id == user_id, ClassroomMembership.status == MembershipStatus.active)
                .order_by(Classroom.id)
            )
        )

    # memberships
    def membership(self, classroom_id: int, user_id: uuid.UUID) -> ClassroomMembership | None:
        return self.db.scalar(
            select(ClassroomMembership).where(ClassroomMembership.classroom_id == classroom_id, ClassroomMembership.user_id == user_id)
        )

    def add_membership(self, classroom_id: int, user_id: uuid.UUID, status: MembershipStatus) -> ClassroomMembership:
        membership = ClassroomMembership(classroom_id=classroom_id, user_id=user_id, status=status)
        self.db.add(membership)
        self.db.flush()
        return membership

    def remove_membership(self, membership: ClassroomMembership) -> None:
        self.db.delete(membership)

    def members(self, classroom_id: int) -> list[tuple[ClassroomMembership, User]]:
        rows = self.db.execute(
            select(ClassroomMembership, User)
            .join(User, User.id == ClassroomMembership.user_id)
            .where(ClassroomMembership.classroom_id == classroom_id)
            .order_by(User.display_name)
        )
        return [(m, u) for m, u in rows]

    # assignments
    def add_assignment(self, assignment: Assignment) -> Assignment:
        self.db.add(assignment)
        self.db.flush()
        return assignment

    def assignments(self, classroom_id: int) -> list[Assignment]:
        return list(self.db.scalars(select(Assignment).where(Assignment.classroom_id == classroom_id).order_by(Assignment.id)))

    def memberships_for_user(self, user_id: uuid.UUID) -> list[tuple[ClassroomMembership, Classroom]]:
        rows = self.db.execute(
            select(ClassroomMembership, Classroom)
            .join(Classroom, Classroom.id == ClassroomMembership.classroom_id)
            .where(ClassroomMembership.user_id == user_id)
            .order_by(Classroom.id)
        )
        return [(m, c) for m, c in rows]

    def member_count(self, classroom_id: int) -> int:
        return self.db.scalar(select(func.count()).select_from(ClassroomMembership).where(ClassroomMembership.classroom_id == classroom_id)) or 0
