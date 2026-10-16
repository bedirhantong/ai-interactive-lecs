"""Notebook snapshots. Saves use optimistic concurrency (ETag / If-Match), see NotebookService."""

from typing import Annotated

from fastapi import APIRouter, Header, Request, Response, status

from app.api.deps import CurrentUser, NotebookSvc
from app.api.schemas.learning import NotebookOut, NotebookSummaryOut
from app.core.responses import ERROR_RESPONSES, ApiResponse, ok
from app.models import StudentNotebook
from app.services.notebooks import etag

router = APIRouter(prefix="/notebooks", tags=["notebooks"], responses=ERROR_RESPONSES)


def _summary(nb: StudentNotebook) -> NotebookSummaryOut:
    return NotebookSummaryOut(lesson_id=nb.lesson_id, lesson_version=nb.lesson_version, revision=nb.revision, updated_at=nb.updated_at)


def _out(nb: StudentNotebook) -> NotebookOut:
    return NotebookOut(**_summary(nb).model_dump(), state=nb.state)


@router.get("", response_model=ApiResponse[list[NotebookSummaryOut]], summary="Kayıtlı defterlerim (içerik olmadan)")
def list_notebooks(user: CurrentUser, notebooks: NotebookSvc):
    """For sync on startup: compare each `revision` with the local copy and download only what changed."""
    return ok([_summary(nb) for nb in notebooks.list_for(user)])


@router.get("/{lesson_id}", response_model=ApiResponse[NotebookOut], summary="Kayıtlı defterim")
def get_notebook(lesson_id: str, user: CurrentUser, notebooks: NotebookSvc, response: Response):
    nb = notebooks.get(user, lesson_id)
    response.headers["ETag"] = etag(nb.revision)
    return ok(_out(nb))


@router.put(
    "/{lesson_id}",
    response_model=ApiResponse[NotebookOut],
    summary="Defterimi kaydet (sürüm kontrollü)",
    responses={201: {"description": "First snapshot created"}},
)
async def save_notebook(
    lesson_id: str,
    request: Request,
    response: Response,
    user: CurrentUser,
    notebooks: NotebookSvc,
    if_match: Annotated[str | None, Header(description='Sürüm: ör. "3". Sonraki kayıtlar için zorunlu.')] = None,
    if_none_match: Annotated[str | None, Header(description="İlk kayıt için: *")] = None,
):
    """Body: the notebook snapshot (`{"schema": 1, "lessonId": ..., "lessonVersion": ..., ...}`).

    - First save: `If-None-Match: *` → 201. Later saves: `If-Match: "<revision>"` → 200.
    - Someone saved in between → 412 `notebook_revision_conflict` (current revision in `error.details`).
    - No precondition header → 428.
    """
    result = notebooks.save(user, lesson_id, await request.body(), if_match=if_match, if_none_match=if_none_match)
    response.headers["ETag"] = etag(result.notebook.revision)
    if result.created:
        response.status_code = status.HTTP_201_CREATED
    return ok(_out(result.notebook))
