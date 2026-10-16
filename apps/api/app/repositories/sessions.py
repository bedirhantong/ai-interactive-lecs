import uuid
from datetime import datetime

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.models import AuthSession


class SessionRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: uuid.UUID, token_hash: str, now: datetime, expires_at: datetime) -> AuthSession:
        row = AuthSession(user_id=user_id, token_hash=token_hash, created_at=now, expires_at=expires_at)
        self.db.add(row)
        self.db.flush()
        return row

    def by_token_hash(self, token_hash: str) -> AuthSession | None:
        return self.db.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash, AuthSession.revoked_at.is_(None)))

    def revoke(self, session: AuthSession, now: datetime) -> None:
        session.revoked_at = now

    def revoke_all_for_user(self, user_id: uuid.UUID, now: datetime) -> int:
        result = self.db.execute(update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)).values(revoked_at=now))
        return result.rowcount or 0

    def delete_stale(self, before: datetime) -> int:
        """Remove sessions that expired or were revoked before `before`."""
        result = self.db.execute(delete(AuthSession).where(or_(AuthSession.expires_at < before, AuthSession.revoked_at < before)))
        return result.rowcount or 0

    def for_user(self, user_id: uuid.UUID) -> list[AuthSession]:
        return list(self.db.scalars(select(AuthSession).where(AuthSession.user_id == user_id).order_by(AuthSession.id)))
