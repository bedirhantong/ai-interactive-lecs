from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import AuthAttempt


class AttemptRepository:
    def __init__(self, db: Session):
        self.db = db

    def record(self, action: str, key_hash: str, ip_hash: str, succeeded: bool, now: datetime) -> None:
        self.db.add(AuthAttempt(action=action, key_hash=key_hash, ip_hash=ip_hash, succeeded=succeeded, created_at=now))

    def failure_times_for_key(self, action: str, key_hash: str, since: datetime) -> list[datetime]:
        """Failures for this key inside the window and after its last success (a success resets the count)."""
        last_success = select(func.max(AuthAttempt.created_at)).where(
            AuthAttempt.action == action, AuthAttempt.key_hash == key_hash, AuthAttempt.succeeded.is_(True)
        )
        rows = self.db.scalars(
            select(AuthAttempt.created_at)
            .where(AuthAttempt.action == action, AuthAttempt.key_hash == key_hash, AuthAttempt.succeeded.is_(False), AuthAttempt.created_at >= since)
            .where(AuthAttempt.created_at > func.coalesce(last_success.scalar_subquery(), since))
            .order_by(AuthAttempt.created_at)
        )
        return list(rows)

    def times_for_ip(self, action: str, ip_hash: str, since: datetime, *, failures_only: bool) -> list[datetime]:
        query = select(AuthAttempt.created_at).where(AuthAttempt.action == action, AuthAttempt.ip_hash == ip_hash, AuthAttempt.created_at >= since)
        if failures_only:
            query = query.where(AuthAttempt.succeeded.is_(False))
        return list(self.db.scalars(query.order_by(AuthAttempt.created_at)))

    def delete_older_than(self, before: datetime) -> int:
        return self.db.execute(delete(AuthAttempt).where(AuthAttempt.created_at < before)).rowcount or 0
