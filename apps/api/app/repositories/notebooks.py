import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import StudentNotebook


class NotebookRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: uuid.UUID, lesson_id: str) -> StudentNotebook | None:
        return self.db.scalar(select(StudentNotebook).where(StudentNotebook.user_id == user_id, StudentNotebook.lesson_id == lesson_id))

    def for_user(self, user_id: uuid.UUID) -> list[StudentNotebook]:
        return list(self.db.scalars(select(StudentNotebook).where(StudentNotebook.user_id == user_id).order_by(StudentNotebook.lesson_id)))

    def create(self, user_id: uuid.UUID, lesson_id: str, lesson_version: int, state: dict, now: datetime) -> StudentNotebook | None:
        """Insert revision 1. Returns None if a notebook already exists (e.g. a parallel first save won)."""
        notebook = StudentNotebook(user_id=user_id, lesson_id=lesson_id, lesson_version=lesson_version, state=state, revision=1, updated_at=now)
        try:
            with self.db.begin_nested():
                self.db.add(notebook)
        except IntegrityError:
            return None
        return notebook

    def update_if_revision(self, user_id: uuid.UUID, lesson_id: str, expected_revision: int, lesson_version: int, state: dict, now: datetime) -> bool:
        """Atomic compare-and-set: writes only if the stored revision is still `expected_revision`.

        Doing the check and the write in one UPDATE means two concurrent saves based on the same
        revision cannot both succeed (no lost update), without holding locks.
        """
        result = self.db.execute(
            update(StudentNotebook)
            .where(StudentNotebook.user_id == user_id, StudentNotebook.lesson_id == lesson_id, StudentNotebook.revision == expected_revision)
            .values(state=state, lesson_version=lesson_version, revision=StudentNotebook.revision + 1, updated_at=now)
            .execution_options(synchronize_session=False)
        )
        return (result.rowcount or 0) == 1

    def refresh(self, notebook: StudentNotebook) -> StudentNotebook:
        self.db.refresh(notebook)
        return notebook
