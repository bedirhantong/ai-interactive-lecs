from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.services.accounts import MAX_BULK, ProvisionedAccount

DisplayName = Annotated[str, StringConstraints(min_length=1, max_length=60, strip_whitespace=True)]


class StudentIn(BaseModel):
    display_name: DisplayName = Field(description="Öğrencinin sınıfta görünecek adı. Yalnızca ad + soyadın baş harfi önerilir (ör. 'Ayşe K.').")


class StudentsBulkIn(BaseModel):
    students: list[StudentIn] = Field(min_length=1, max_length=MAX_BULK)


class TeacherIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    display_name: DisplayName


class CredentialOut(BaseModel):
    """Shown exactly once. The one-time password is not stored in clear text and cannot be retrieved later."""

    user_id: str
    display_name: str
    login: str
    one_time_password: str

    @classmethod
    def of(cls, account: ProvisionedAccount) -> "CredentialOut":
        return cls(
            user_id=str(account.user.id), display_name=account.user.display_name, login=account.login, one_time_password=account.one_time_password
        )
