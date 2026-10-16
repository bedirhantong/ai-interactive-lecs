"""Accountability log: who accessed or changed whose data."""

import uuid
from dataclasses import dataclass
from datetime import datetime

from app.core.clock import Clock
from app.domain.audit import DESCRIPTIONS, AuditAction
from app.models import AuditEvent, User
from app.repositories.audit import AuditRepository


@dataclass(frozen=True)
class AccessLogEntry:
    id: int
    action: AuditAction
    description: str
    actor_name: str | None  # None when the actor's account no longer exists
    actor_role: str | None
    is_self: bool
    classroom_id: int | None
    at: datetime


class AuditService:
    """record() joins the caller's transaction (no commit of its own), so an action and its
    audit entry are stored together or not at all."""

    def __init__(self, audit: AuditRepository, clock: Clock):
        self.audit = audit
        self.clock = clock

    def record(self, action: AuditAction, *, actor: User | None, subject_id: uuid.UUID | None = None, classroom_id: int | None = None) -> None:
        self.audit.add(
            AuditEvent(
                action=action,
                actor_id=actor.id if actor else None,
                actor_role=actor.role if actor else None,
                subject_id=subject_id,
                classroom_id=classroom_id,
                created_at=self.clock.now(),
            )
        )

    def access_log(self, user: User, *, cursor: int | None, limit: int) -> tuple[list[AccessLogEntry], int | None]:
        rows, next_cursor = self.audit.page_for_subject(user.id, cursor=cursor, limit=limit)
        entries = [
            AccessLogEntry(
                id=event.id,
                action=AuditAction(event.action),
                description=DESCRIPTIONS[AuditAction(event.action)],
                actor_name=actor.display_name if actor else None,
                actor_role=event.actor_role,
                is_self=event.actor_id == user.id,
                classroom_id=event.classroom_id,
                at=event.created_at,
            )
            for event, actor in rows
        ]
        return entries, next_cursor
