from typing import Annotated

from fastapi import APIRouter, Query, status
from pydantic import Field

from app.api.deps import CurrentUser, ProgressSvc
from app.api.schemas.common import Slug
from app.api.schemas.learning import EventIn, EventOut, RecordedOut
from app.core.responses import ERROR_RESPONSES, ApiResponse, Pagination, ok
from app.services.progress import NewEvent

router = APIRouter(prefix="/progress", tags=["progress"], responses=ERROR_RESPONSES)


@router.post("/events", response_model=ApiResponse[RecordedOut], status_code=status.HTTP_201_CREATED, summary="İlerleme kanıtı gönder")
def record_events(events: Annotated[list[EventIn], Field(min_length=1, max_length=100)], user: CurrentUser, progress: ProgressSvc):
    """Idempotent by `client_event_id`. Stored as self-reported: computed in the browser, not proof of learning."""
    result = progress.record(user, [NewEvent(**e.model_dump()) for e in events])
    return ok(RecordedOut(stored=result.stored, duplicates=result.duplicates))


@router.get("/events", response_model=ApiResponse[list[EventOut]], summary="İlerleme kanıtlarım (sayfalı, en yeni önce)")
def my_events(
    user: CurrentUser,
    progress: ProgressSvc,
    lesson_id: Slug | None = None,
    cursor: int | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    items, next_cursor = progress.page(user, lesson_id, cursor, limit)
    return ok([EventOut.model_validate(e) for e in items], pagination=Pagination(limit=limit, next_cursor=next_cursor))
