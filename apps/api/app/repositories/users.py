import uuid
from datetime import datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import Role, User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: uuid.UUID) -> User | None:
        return self.db.get(User, user_id)

    def by_login(self, login: str) -> User | None:
        """`login` is already normalized (lowercase): an email or a username."""
        return self.db.scalar(select(User).where(or_(User.email == login, User.username == login)))

    def email_exists(self, email: str) -> bool:
        return self.db.scalar(select(User.id).where(User.email == email)) is not None

    def username_exists(self, username: str) -> bool:
        return self.db.scalar(select(User.id).where(User.username == username)) is not None

    def add(self, user: User) -> User:
        self.db.add(user)
        self.db.flush()
        return user

    def delete(self, user: User) -> None:
        self.db.delete(user)

    def delete_demo_users_created_before(self, before: datetime) -> int:
        """Demo accounts are throwaway; their data goes with them (ON DELETE CASCADE)."""
        return self.db.execute(delete(User).where(User.is_demo.is_(True), User.created_at < before)).rowcount or 0

    def inactive_students_before(self, before: datetime) -> list[User]:
        """Non-demo students whose last login (or creation, if never) is older than `before`."""
        last_seen = func.coalesce(User.last_login_at, User.created_at)
        return list(self.db.scalars(select(User).where(User.role == Role.student, User.is_demo.is_(False), last_seen < before)))
