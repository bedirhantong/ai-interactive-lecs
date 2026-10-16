from fastapi import APIRouter, Query, Request, Response, status

from app.api.deps import CurrentUser, ReportSvc
from app.api.schemas.common import Slug
from app.api.schemas.learning import ReportOut
from app.core.responses import ERROR_RESPONSES, ApiResponse, ok

router = APIRouter(prefix="/reports", tags=["colab-reports"], responses=ERROR_RESPONSES)


@router.post(
    "",
    response_model=ApiResponse[ReportOut],
    status_code=status.HTTP_201_CREATED,
    summary="Colab raporu yükle",
    responses={200: {"description": "This exact report was already uploaded; the stored one is returned"}},
)
async def upload_report(request: Request, response: Response, user: CurrentUser, reports: ReportSvc, lesson_id: Slug = Query()):
    """Bounded JSON, validated against report schema 1.x, never executed, stored as self-reported.
    Idempotent: the same report content uploaded again returns 200 with the stored report."""
    result = reports.submit(user, lesson_id, await request.body())
    if not result.created:
        response.status_code = status.HTTP_200_OK
    return ok(ReportOut.model_validate(result.report))


@router.get("", response_model=ApiResponse[list[ReportOut]], summary="Raporlarım")
def my_reports(user: CurrentUser, reports: ReportSvc):
    return ok([ReportOut.model_validate(r) for r in reports.for_user(user)])
