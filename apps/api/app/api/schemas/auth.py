from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models import Role, User


class UserOut(BaseModel):
    id: str
    role: Role
    display_name: str
    username: str | None = None
    email: str | None = None
    age_band: str | None = None
    is_demo: bool
    must_change_password: bool

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(
            id=str(user.id),
            role=user.role,
            display_name=user.display_name,
            username=user.username,
            email=user.email,
            age_band=user.age_band,
            is_demo=user.is_demo,
            must_change_password=user.must_change_password,
        )


class SessionOut(BaseModel):
    user: UserOut
    expires_at: datetime


class LoginIn(BaseModel):
    login: str = Field(min_length=3, max_length=254, description="Öğretmen/yönetici için e-posta, öğrenci için kullanıcı adı.")
    password: str = Field(min_length=1, max_length=200)


class DemoIn(BaseModel):
    role: Literal["student", "teacher"] = "student"


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


class LogoutOut(BaseModel):
    sessions_ended: int
