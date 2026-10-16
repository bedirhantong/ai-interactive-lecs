from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.services.audit import AccessLogEntry


class ProfileUpdateIn(BaseModel):
    """Only the fields you send are changed. Send `"age_band": null` to remove your age band."""

    display_name: Annotated[str, StringConstraints(min_length=1, max_length=60, strip_whitespace=True)] | None = None
    age_band: Literal["11-13", "14-15", "16-18"] | None = None


class AccountDeleteIn(BaseModel):
    password: str | None = Field(default=None, max_length=200, description="Şifreli hesaplar için zorunlu. Demo hesaplarında boş bırakılır.")
    confirm: Literal[True] = Field(description="Geri alınamayacağını onaylamak için true gönder.")


class AccessLogEntryOut(BaseModel):
    id: int
    action: str
    description: str
    by: str | None = Field(description="İşlemi yapan kişinin görünen adı; hesabı silinmişse null.")
    by_role: str | None
    by_me: bool
    classroom_id: int | None
    at: datetime

    @classmethod
    def of(cls, e: AccessLogEntry) -> "AccessLogEntryOut":
        return cls(
            id=e.id,
            action=e.action,
            description=e.description,
            by=e.actor_name,
            by_role=e.actor_role,
            by_me=e.is_self,
            classroom_id=e.classroom_id,
            at=e.at,
        )
