"""Teachers reviewing the evidence of approved students in their own classrooms. Every look is audited."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from app.core.uow import UnitOfWork
from app.domain.audit import AuditAction
from app.models import MembershipStatus, ProgressEvent, TrainingReport, User
from app.repositories.classrooms import ClassroomRepository
from app.repositories.notebooks import NotebookRepository
from app.repositories.progress import ProgressRepository
from app.repositories.reports import ReportRepository
from app.services.audit import AuditService
from app.services.classroom_access import ClassroomAccess


@dataclass(frozen=True)
class StudentSummary:
    user: User
    status: MembershipStatus
    last_activity_at: datetime | None
    completed_lessons: list[str]
    challenges_passed: int
    reports: int
    latest_test_accuracy: float | None


@dataclass(frozen=True)
class Reflection:
    lesson_id: str
    cell_id: str
    text: str
    submitted_at: str | None


def extract_reflections(lesson_id: str, state: dict) -> list[Reflection]:
    """Submitted reflections inside a notebook snapshot (cells of kind "reflection", see apps/web/lib/notebook/types.ts)."""
    cells = state.get("cells") if isinstance(state, dict) else None
    found: list[Reflection] = []
    for cell_id, cell in (cells or {}).items():
        if (
            isinstance(cell, dict)
            and cell.get("kind") == "reflection"
            and isinstance(cell.get("submittedText"), str)
            and cell["submittedText"].strip()
        ):
            submitted = cell.get("submittedAt")
            found.append(Reflection(lesson_id, str(cell_id), cell["submittedText"][:5000], submitted if isinstance(submitted, str) else None))
    return found


class ReviewService:
    def __init__(
        self,
        access: ClassroomAccess,
        classrooms: ClassroomRepository,
        progress: ProgressRepository,
        reports: ReportRepository,
        notebooks: NotebookRepository,
        audit: AuditService,
        uow: UnitOfWork,
    ):
        self.access = access
        self.classrooms = classrooms
        self.progress = progress
        self.reports = reports
        self.notebooks = notebooks
        self.audit = audit
        self.uow = uow

    def _authorize(self, teacher: User, classroom_id: int, student_id: uuid.UUID) -> None:
        self.access.owned(teacher, classroom_id)
        self.access.active_member(classroom_id, student_id)

    def overview(self, teacher: User, classroom_id: int) -> list[StudentSummary]:
        """One row per member. Pending (not yet approved) members show no learning data."""
        self.access.owned(teacher, classroom_id)
        members = self.classrooms.members(classroom_id)
        active_ids = [u.id for m, u in members if m.status == MembershipStatus.active]
        progress = self.progress.summary_for_users(active_ids)
        reports = self.reports.summary_for_users(active_ids)
        rows = []
        for membership, user in members:
            p = progress.get(user.id, {"last_activity_at": None, "completed_lessons": [], "challenges_passed": 0})
            r = reports.get(user.id, {"reports": 0, "latest_test_accuracy": None})
            rows.append(
                StudentSummary(
                    user,
                    membership.status,
                    p["last_activity_at"],
                    p["completed_lessons"],
                    p["challenges_passed"],
                    r["reports"],
                    r["latest_test_accuracy"],
                )
            )
        for uid in active_ids:
            self.audit.record(AuditAction.CLASS_OVERVIEW_VIEWED, actor=teacher, subject_id=uid, classroom_id=classroom_id)
        self.uow.commit()
        return rows

    def student_progress(
        self, teacher: User, classroom_id: int, student_id: uuid.UUID, cursor: int | None, limit: int
    ) -> tuple[list[ProgressEvent], int | None]:
        self._authorize(teacher, classroom_id, student_id)
        result = self.progress.page(student_id, lesson_id=None, cursor=cursor, limit=limit)
        self.audit.record(AuditAction.STUDENT_PROGRESS_VIEWED, actor=teacher, subject_id=student_id, classroom_id=classroom_id)
        self.uow.commit()
        return result

    def student_reports(self, teacher: User, classroom_id: int, student_id: uuid.UUID) -> list[TrainingReport]:
        self._authorize(teacher, classroom_id, student_id)
        reports = self.reports.for_user(student_id)
        self.audit.record(AuditAction.STUDENT_REPORTS_VIEWED, actor=teacher, subject_id=student_id, classroom_id=classroom_id)
        self.uow.commit()
        return reports

    def student_reflections(self, teacher: User, classroom_id: int, student_id: uuid.UUID) -> list[Reflection]:
        self._authorize(teacher, classroom_id, student_id)
        found = [r for nb in self.notebooks.for_user(student_id) for r in extract_reflections(nb.lesson_id, nb.state)]
        self.audit.record(AuditAction.STUDENT_REFLECTIONS_VIEWED, actor=teacher, subject_id=student_id, classroom_id=classroom_id)
        self.uow.commit()
        return sorted(found, key=lambda r: r.submitted_at or "", reverse=True)
