"""Classroom roster, assignments, and teachers reviewing student evidence."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import ClassroomSvc, CurrentUser, ReviewSvc, TeacherUser
from app.api.schemas.classrooms import (
    AssignmentIn,
    AssignmentOut,
    ClassroomIn,
    ClassroomOut,
    JoinIn,
    JoinOut,
    MemberOut,
    ReflectionOut,
    StudentSummaryOut,
)
from app.api.schemas.learning import EventOut, ReportOut
from app.core.responses import ERROR_RESPONSES, ApiResponse, Pagination, ok
from app.models import Role

router = APIRouter(prefix="/classrooms", tags=["classrooms"], responses=ERROR_RESPONSES)


@router.post("", response_model=ApiResponse[ClassroomOut], status_code=status.HTTP_201_CREATED, summary="Sınıf oluştur")
def create_classroom(body: ClassroomIn, teacher: TeacherUser, classrooms: ClassroomSvc):
    return ok(ClassroomOut.of(classrooms.create(teacher, body.name), show_code=True))


@router.get("", response_model=ApiResponse[list[ClassroomOut]], summary="Sınıflarım")
def my_classrooms(user: CurrentUser, classrooms: ClassroomSvc):
    show_code = user.role in (Role.teacher, Role.admin)
    return ok([ClassroomOut.of(r, show_code=show_code) for r in classrooms.list_for(user)])


@router.post("/join", response_model=ApiResponse[JoinOut], status_code=status.HTTP_202_ACCEPTED, summary="Sınıf koduyla katılma isteği")
def join(body: JoinIn, user: CurrentUser, classrooms: ClassroomSvc):
    return ok(JoinOut(status=classrooms.join(user, body.code)))


@router.get("/{classroom_id}/members", response_model=ApiResponse[list[MemberOut]], summary="Sınıf üyeleri")
def members(classroom_id: int, teacher: TeacherUser, classrooms: ClassroomSvc):
    return ok([MemberOut.of(m, u) for m, u in classrooms.members(teacher, classroom_id)])


@router.post("/{classroom_id}/members/{user_id}/approve", response_model=ApiResponse[MemberOut], summary="Katılım isteğini onayla")
def approve(classroom_id: int, user_id: uuid.UUID, teacher: TeacherUser, classrooms: ClassroomSvc):
    return ok(MemberOut.of(*classrooms.approve(teacher, classroom_id, user_id)))


@router.delete("/{classroom_id}/members/{user_id}", response_model=ApiResponse[None], summary="Öğrenciyi sınıftan çıkar")
def remove_member(classroom_id: int, user_id: uuid.UUID, teacher: TeacherUser, classrooms: ClassroomSvc):
    """The student's account and work are kept; only the class membership is removed."""
    classrooms.remove_member(teacher, classroom_id, user_id)
    return ok(None)


@router.post("/{classroom_id}/assignments", response_model=ApiResponse[AssignmentOut], status_code=status.HTTP_201_CREATED, summary="Ödev ver")
def create_assignment(classroom_id: int, body: AssignmentIn, teacher: TeacherUser, classrooms: ClassroomSvc):
    return ok(AssignmentOut.of(classrooms.add_assignment(teacher, classroom_id, body.lesson_id, body.due_at)))


@router.get("/{classroom_id}/assignments", response_model=ApiResponse[list[AssignmentOut]], summary="Ödevler")
def list_assignments(classroom_id: int, user: CurrentUser, classrooms: ClassroomSvc):
    return ok([AssignmentOut.of(a) for a in classrooms.assignments(user, classroom_id)])


@router.get("/{classroom_id}/students/{user_id}/progress", response_model=ApiResponse[list[EventOut]], summary="Öğrencinin ilerleme kanıtları")
def student_progress(
    classroom_id: int,
    user_id: uuid.UUID,
    teacher: TeacherUser,
    review: ReviewSvc,
    cursor: int | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    items, next_cursor = review.student_progress(teacher, classroom_id, user_id, cursor, limit)
    return ok([EventOut.model_validate(e) for e in items], pagination=Pagination(limit=limit, next_cursor=next_cursor))


@router.get("/{classroom_id}/students/{user_id}/reports", response_model=ApiResponse[list[ReportOut]], summary="Öğrencinin Colab raporları")
def student_reports(classroom_id: int, user_id: uuid.UUID, teacher: TeacherUser, review: ReviewSvc):
    return ok([ReportOut.model_validate(r) for r in review.student_reports(teacher, classroom_id, user_id)])


@router.get("/{classroom_id}/overview", response_model=ApiResponse[list[StudentSummaryOut]], summary="Sınıf özeti (öğrenci başına ilerleme)")
def overview(classroom_id: int, teacher: TeacherUser, review: ReviewSvc):
    """One row per member: last activity, completed lessons, passed challenges, Colab reports. Pending members show no data."""
    return ok([StudentSummaryOut.of(s) for s in review.overview(teacher, classroom_id)])


@router.get("/{classroom_id}/students/{user_id}/reflections", response_model=ApiResponse[list[ReflectionOut]], summary="Öğrencinin yansıtma yazıları")
def student_reflections(classroom_id: int, user_id: uuid.UUID, teacher: TeacherUser, review: ReviewSvc):
    return ok(
        [
            ReflectionOut(lesson_id=r.lesson_id, cell_id=r.cell_id, text=r.text, submitted_at=r.submitted_at)
            for r in review.student_reflections(teacher, classroom_id, user_id)
        ]
    )
