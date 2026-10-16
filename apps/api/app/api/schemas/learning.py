from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.api.schemas.common import Slug
from app.models import Verification


class LessonOut(BaseModel):
    id: str
    version: int
    title: str
    level: str
    labs: list[str]
    project_id: str | None


class NotebookSummaryOut(BaseModel):
    """What a client needs to decide whether to download a notebook (compare `revision` with its own)."""

    lesson_id: str
    lesson_version: int
    revision: int
    updated_at: datetime


class NotebookOut(NotebookSummaryOut):
    state: dict[str, Any]


class EventIn(BaseModel):
    client_event_id: Annotated[str, StringConstraints(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")] = Field(
        description="Client-generated unique id (e.g. a UUID). Sending the same id again is ignored, so batches can be retried safely."
    )
    lesson_id: Slug
    cell_id: Slug
    kind: Annotated[str, StringConstraints(max_length=40, pattern=r"^[a-z-]+$")]
    detail: Annotated[str, StringConstraints(max_length=300)] = ""
    occurred_at: datetime


class EventOut(EventIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    verification: Verification


class RecordedOut(BaseModel):
    stored: int = Field(description="Newly stored events.")
    duplicates: int = Field(description="Events ignored because their client_event_id was already stored.")


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lesson_id: str
    project_id: str
    template_id: str
    notebook_version: str
    test_accuracy: float
    verification: Verification
    teacher_note: str | None
    created_at: datetime
