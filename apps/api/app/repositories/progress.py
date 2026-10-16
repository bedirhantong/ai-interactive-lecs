import uuid

from sqlalchemy import select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.models import ProgressEvent


class ProgressRepository:
    def __init__(self, db: Session):
        self.db = db

    def insert_new(self, rows: list[dict]) -> int:
        """Insert events, silently skipping any (user_id, client_event_id) that already exists.

        Uses INSERT ... ON CONFLICT DO NOTHING RETURNING, so retries and concurrent duplicates are
        ignored by the database itself. Returns how many rows were actually inserted.
        """
        if not rows:
            return 0
        dialect = self.db.get_bind().dialect.name
        insert = {"postgresql": postgresql.insert, "sqlite": sqlite.insert}[dialect]
        statement = (
            insert(ProgressEvent).values(rows).on_conflict_do_nothing(index_elements=["user_id", "client_event_id"]).returning(ProgressEvent.id)
        )
        return len(self.db.execute(statement).all())

    def page(self, user_id: uuid.UUID, *, lesson_id: str | None, cursor: int | None, limit: int) -> tuple[list[ProgressEvent], int | None]:
        """Newest first. Returns (items, next_cursor)."""
        query = select(ProgressEvent).where(ProgressEvent.user_id == user_id)
        if lesson_id:
            query = query.where(ProgressEvent.lesson_id == lesson_id)
        if cursor:
            query = query.where(ProgressEvent.id < cursor)
        rows = list(self.db.scalars(query.order_by(ProgressEvent.id.desc()).limit(limit + 1)))
        return rows[:limit], (rows[limit - 1].id if len(rows) > limit else None)

    def all_for_user(self, user_id: uuid.UUID) -> list[ProgressEvent]:
        return list(self.db.scalars(select(ProgressEvent).where(ProgressEvent.user_id == user_id).order_by(ProgressEvent.id)))
