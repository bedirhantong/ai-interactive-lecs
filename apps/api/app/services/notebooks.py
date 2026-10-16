"""Notebook snapshots with optimistic concurrency.

Every snapshot has a `revision`. Clients must say what they based a save on:
- first save of a lesson:  If-None-Match: *          (fails with 412 if one already exists)
- later saves:             If-Match: "<revision>"    (fails with 412 if someone saved in between)
A save without either header is refused (428), so no client can overwrite another device's
work by accident. On 412 the client fetches the current snapshot, merges or chooses, and
saves again with the new revision.
"""

import json
import re
from dataclasses import dataclass
from datetime import UTC

from app.core.clock import Clock
from app.core.config import Settings
from app.core.uow import UnitOfWork
from app.domain.errors import InvalidInput, NotFound, PayloadTooLarge, PreconditionFailed, PreconditionRequired
from app.models import StudentNotebook, User
from app.repositories.notebooks import NotebookRepository
from app.services.content import Catalog, LessonInfo

_ETAG = re.compile(r'^(?:W/)?"?(\d{1,9})"?$')


def etag(revision: int) -> str:
    return f'"{revision}"'


def parse_if_match(value: str) -> int:
    match = _ETAG.match(value.strip())
    if not match:
        raise InvalidInput('If-Match bir sürüm numarası olmalı (ör. "3").', code="invalid_if_match")
    return int(match.group(1))


@dataclass(frozen=True)
class SaveResult:
    notebook: StudentNotebook
    created: bool


class NotebookService:
    def __init__(self, notebooks: NotebookRepository, catalog: Catalog, settings: Settings, clock: Clock, uow: UnitOfWork):
        self.notebooks = notebooks
        self.catalog = catalog
        self.settings = settings
        self.clock = clock
        self.uow = uow

    def _lesson(self, lesson_id: str) -> LessonInfo:
        lesson = self.catalog.lessons.get(lesson_id)
        if lesson is None:
            raise NotFound("Ders bulunamadı.", code="lesson_not_found")
        return lesson

    def get(self, user: User, lesson_id: str) -> StudentNotebook:
        """Only the owner's own notebook is ever returned (the user comes from the session, never the URL)."""
        self._lesson(lesson_id)
        notebook = self.notebooks.get(user.id, lesson_id)
        if notebook is None:
            raise NotFound("Kayıtlı defter yok.", code="notebook_not_found")
        return notebook

    def list_for(self, user: User) -> list[StudentNotebook]:
        return self.notebooks.for_user(user.id)

    def _parse(self, lesson: LessonInfo, lesson_id: str, raw: bytes) -> tuple[int, dict]:
        """The state is opaque client data; only its envelope is checked."""
        if len(raw) > self.settings.max_notebook_bytes:
            raise PayloadTooLarge("Defter kaydı çok büyük.")
        try:
            state = json.loads(raw)
        except json.JSONDecodeError:
            raise InvalidInput("Geçersiz JSON.", code="invalid_json") from None
        if not isinstance(state, dict) or state.get("schema") != 1 or state.get("lessonId") != lesson_id:
            raise InvalidInput("Defter kaydı bu derse ait değil.", code="notebook_lesson_mismatch")
        version = state.get("lessonVersion")
        if not isinstance(version, int) or not 1 <= version <= lesson.version:
            raise InvalidInput("Geçersiz ders sürümü.", code="invalid_lesson_version")
        return version, state

    def _conflict(self, current: StudentNotebook, message: str | None = None) -> PreconditionFailed:
        updated = current.updated_at if current.updated_at.tzinfo else current.updated_at.replace(tzinfo=UTC)
        return PreconditionFailed(
            message,
            code="notebook_revision_conflict",
            details=[{"field": "If-Match", "current_revision": current.revision, "updated_at": updated.isoformat()}],
        )

    def save(self, user: User, lesson_id: str, raw: bytes, *, if_match: str | None, if_none_match: str | None) -> SaveResult:
        lesson = self._lesson(lesson_id)
        version, state = self._parse(lesson, lesson_id, raw)
        now = self.clock.now()

        if if_none_match is not None:
            if if_none_match.strip() != "*":
                raise InvalidInput("If-None-Match yalnızca * olabilir.", code="invalid_if_none_match")
            created = self.notebooks.create(user.id, lesson_id, version, state, now)
            if created is None:
                raise self._conflict(
                    self.notebooks.get(user.id, lesson_id), "Bu ders için zaten kayıtlı bir defter var. Güncel hâli alıp tekrar dene."
                )
            self.uow.commit()
            return SaveResult(created, created=True)

        if if_match is None:
            raise PreconditionRequired('Kaydederken sürümü belirt: ilk kayıt için If-None-Match: *, sonrakiler için If-Match: "<sürüm>".')
        expected = parse_if_match(if_match)
        if not self.notebooks.update_if_revision(user.id, lesson_id, expected, version, state, now):
            current = self.notebooks.get(user.id, lesson_id)
            if current is None:
                raise NotFound("Kayıtlı defter yok. İlk kayıt için If-None-Match: * gönder.", code="notebook_not_found")
            raise self._conflict(current)
        self.uow.commit()
        return SaveResult(self.notebooks.refresh(self.notebooks.get(user.id, lesson_id)), created=False)
