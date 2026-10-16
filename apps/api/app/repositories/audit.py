import uuid
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import AuditEvent, User


class AuditRepository:
    def __init__(self, db: Session):
        self.db = db

    def add(self, event: AuditEvent) -> None:
        self.db.add(event)

    def page_for_subject(self, subject_id: uuid.UUID, *, cursor: int | None, limit: int) -> tuple[list[tuple[AuditEvent, User | None]], int | None]:
        """Events about this person, newest first, with the actor (None if the actor's account was deleted)."""
        query = select(AuditEvent, User).outerjoin(User, User.id == AuditEvent.actor_id).where(AuditEvent.subject_id == subject_id)
        if cursor:
            query = query.where(AuditEvent.id < cursor)
        rows = [(e, u) for e, u in self.db.execute(query.order_by(AuditEvent.id.desc()).limit(limit + 1))]
        return rows[:limit], (rows[limit - 1][0].id if len(rows) > limit else None)

    def delete_older_than(self, before: datetime) -> int:
        return self.db.execute(delete(AuditEvent).where(AuditEvent.created_at < before)).rowcount or 0
