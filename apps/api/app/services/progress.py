"""Learning evidence reported by the browser. Stored as self-reported, never as proof.

Ingestion is idempotent: each event carries a client-generated id, so a batch can be retried
after a network failure without creating duplicates.
"""

from dataclasses import dataclass
from datetime import datetime

from app.core.uow import UnitOfWork
from app.domain.errors import InvalidInput
from app.models import ProgressEvent, User, Verification
from app.repositories.progress import ProgressRepository
from app.services.content import Catalog


@dataclass(frozen=True)
class NewEvent:
    client_event_id: str
    lesson_id: str
    cell_id: str
    kind: str
    detail: str
    occurred_at: datetime


@dataclass(frozen=True)
class RecordResult:
    stored: int
    duplicates: int


class ProgressService:
    def __init__(self, progress: ProgressRepository, catalog: Catalog, uow: UnitOfWork):
        self.progress = progress
        self.catalog = catalog
        self.uow = uow

    def record(self, user: User, events: list[NewEvent]) -> RecordResult:
        for e in events:
            if e.lesson_id not in self.catalog.lessons:
                raise InvalidInput(f"Bilinmeyen ders: {e.lesson_id}", code="unknown_lesson")
        unique = list({e.client_event_id: e for e in reversed(events)}.values())[::-1]  # first occurrence wins
        stored = self.progress.insert_new(
            [
                {
                    "user_id": user.id,
                    "client_event_id": e.client_event_id,
                    "lesson_id": e.lesson_id,
                    "cell_id": e.cell_id,
                    "kind": e.kind,
                    "detail": e.detail,
                    "occurred_at": e.occurred_at,
                    "verification": Verification.self_reported,
                }
                for e in unique
            ]
        )
        self.uow.commit()
        return RecordResult(stored=stored, duplicates=len(events) - stored)

    def page(self, user: User, lesson_id: str | None, cursor: int | None, limit: int) -> tuple[list[ProgressEvent], int | None]:
        return self.progress.page(user.id, lesson_id=lesson_id, cursor=cursor, limit=limit)
