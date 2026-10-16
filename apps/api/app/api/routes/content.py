from fastapi import APIRouter

from app.api.deps import CatalogDep
from app.api.schemas.learning import LessonOut
from app.core.responses import ERROR_RESPONSES, ApiResponse, ok
from app.domain.errors import NotFound
from app.services.content import LessonInfo

router = APIRouter(prefix="/lessons", tags=["content"], responses=ERROR_RESPONSES)


def _out(lesson: LessonInfo) -> LessonOut:
    return LessonOut(
        id=lesson.id, version=lesson.version, title=lesson.title, level=lesson.level, labs=list(lesson.labs), project_id=lesson.project_id
    )


@router.get("", response_model=ApiResponse[list[LessonOut]], summary="Dersler (sürüm ve lab bilgisiyle)")
def list_lessons(catalog: CatalogDep):
    return ok([_out(lesson) for lesson in catalog.lessons.values()])


@router.get("/{lesson_id}", response_model=ApiResponse[LessonOut], summary="Ders")
def get_lesson(lesson_id: str, catalog: CatalogDep):
    lesson = catalog.lessons.get(lesson_id)
    if lesson is None:
        raise NotFound("Ders bulunamadı.", code="lesson_not_found")
    return ok(_out(lesson))
