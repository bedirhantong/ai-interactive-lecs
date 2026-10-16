"""Account provisioning: teachers create student accounts, admins create teacher accounts."""

import uuid

from fastapi import APIRouter, status

from app.api.deps import AccountSvc, AdminUser, TeacherUser
from app.api.schemas.accounts import CredentialOut, StudentIn, StudentsBulkIn, TeacherIn
from app.core.responses import ERROR_RESPONSES, ApiResponse, ok

router = APIRouter(tags=["accounts"], responses=ERROR_RESPONSES)


@router.post(
    "/classrooms/{classroom_id}/students",
    response_model=ApiResponse[CredentialOut],
    status_code=status.HTTP_201_CREATED,
    summary="Sınıfa öğrenci hesabı oluştur",
)
def create_student(classroom_id: int, body: StudentIn, teacher: TeacherUser, accounts: AccountSvc):
    """Returns the username and a one-time password **once**. The student must change it at first login."""
    return ok(CredentialOut.of(accounts.create_students(teacher, classroom_id, [body.display_name])[0]))


@router.post(
    "/classrooms/{classroom_id}/students/bulk",
    response_model=ApiResponse[list[CredentialOut]],
    status_code=status.HTTP_201_CREATED,
    summary="Sınıfa toplu öğrenci hesabı oluştur",
)
def create_students(classroom_id: int, body: StudentsBulkIn, teacher: TeacherUser, accounts: AccountSvc):
    created = accounts.create_students(teacher, classroom_id, [s.display_name for s in body.students])
    return ok([CredentialOut.of(a) for a in created])


@router.post(
    "/classrooms/{classroom_id}/students/{user_id}/reset-password",
    response_model=ApiResponse[CredentialOut],
    summary="Öğrencinin şifresini sıfırla",
)
def reset_student_password(classroom_id: int, user_id: uuid.UUID, teacher: TeacherUser, accounts: AccountSvc):
    """New one-time password; the student is signed out on every device."""
    return ok(CredentialOut.of(accounts.reset_student_password(teacher, classroom_id, user_id)))


@router.delete(
    "/classrooms/{classroom_id}/students/{user_id}",
    response_model=ApiResponse[None],
    summary="Oluşturduğun öğrenci hesabını kalıcı olarak sil",
)
def delete_student(classroom_id: int, user_id: uuid.UUID, teacher: TeacherUser, accounts: AccountSvc):
    """For students who leave the school. Deletes the account and all its data. Only for accounts this teacher created."""
    accounts.delete_student(teacher, classroom_id, user_id)
    return ok(None)


@router.post("/admin/teachers", response_model=ApiResponse[CredentialOut], status_code=status.HTTP_201_CREATED, summary="Öğretmen hesabı oluştur")
def create_teacher(body: TeacherIn, admin: AdminUser, accounts: AccountSvc):
    return ok(CredentialOut.of(accounts.create_teacher(body.email, body.display_name, created_by=admin)))
