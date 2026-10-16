"""Teachers reviewing the evidence of approved students in their own classrooms. Every look is audited."""

import uuid

from app.core.uow import UnitOfWork
from app.domain.audit import AuditAction
from app.models import ProgressEvent, TrainingReport, User
from app.repositories.progress import ProgressRepository
from app.repositories.reports import ReportRepository
from app.services.audit import AuditService
from app.services.classroom_access import ClassroomAccess


class ReviewService:
    def __init__(self, access: ClassroomAccess, progress: ProgressRepository, reports: ReportRepository, audit: AuditService, uow: UnitOfWork):
        self.access = access
        self.progress = progress
        self.reports = reports
        self.audit = audit
        self.uow = uow

    def _authorize(self, teacher: User, classroom_id: int, student_id: uuid.UUID) -> None:
        self.access.owned(teacher, classroom_id)
        self.access.active_member(classroom_id, student_id)

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
