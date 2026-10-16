import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import TrainingReport


class ReportRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, report: TrainingReport) -> TrainingReport | None:
        """Returns None if an identical report (same user, lesson, content hash) already exists."""
        try:
            with self.db.begin_nested():
                self.db.add(report)
        except IntegrityError:
            return None
        return report

    def for_user(self, user_id: uuid.UUID, limit: int = 50) -> list[TrainingReport]:
        return list(self.db.scalars(select(TrainingReport).where(TrainingReport.user_id == user_id).order_by(TrainingReport.id.desc()).limit(limit)))

    def all_for_user(self, user_id: uuid.UUID) -> list[TrainingReport]:
        return list(self.db.scalars(select(TrainingReport).where(TrainingReport.user_id == user_id).order_by(TrainingReport.id)))

    def by_content_hash(self, user_id: uuid.UUID, lesson_id: str, content_hash: str) -> TrainingReport | None:
        return self.db.scalar(
            select(TrainingReport).where(
                TrainingReport.user_id == user_id, TrainingReport.lesson_id == lesson_id, TrainingReport.content_hash == content_hash
            )
        )
