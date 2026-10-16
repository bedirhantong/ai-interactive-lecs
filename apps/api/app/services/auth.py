"""Authentication: sessions, login, demo accounts, logout, password change."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.clock import Clock, as_utc
from app.core.config import Settings
from app.core.uow import UnitOfWork
from app.domain.errors import AuthenticationRequired, InvalidCredentials, InvalidInput, NotFound, PermissionDenied
from app.domain.passwords import policy_for
from app.domain.usernames import normalize_login
from app.models import AuthSession, Role, User
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.security.hashing import PasswordHasher
from app.security.tokens import hash_token, new_session_token
from app.services.rate_limiter import AttemptLimiter


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: AuthSession


@dataclass(frozen=True)
class IssuedSession:
    """A new session. `token` goes into the httpOnly cookie and is never stored in clear text."""

    user: User
    token: str
    expires_at: datetime


def password_context(user: User) -> list[str]:
    """Things a password must not contain."""
    parts = [user.username or "", (user.email or "").split("@")[0], *user.display_name.split()]
    return [p for p in parts if p]


class AuthService:
    def __init__(
        self,
        users: UserRepository,
        sessions: SessionRepository,
        limiter: AttemptLimiter,
        hasher: PasswordHasher,
        clock: Clock,
        settings: Settings,
        uow: UnitOfWork,
    ):
        self.users = users
        self.sessions = sessions
        self.limiter = limiter
        self.hasher = hasher
        self.clock = clock
        self.settings = settings
        self.uow = uow

    def authenticate(self, token: str | None) -> AuthContext:
        if not token:
            raise AuthenticationRequired()
        session = self.sessions.by_token_hash(hash_token(token))
        if session is None or as_utc(session.expires_at) <= self.clock.now():
            raise AuthenticationRequired("Oturumun sona erdi. Tekrar giriş yap.", code="session_expired")
        return AuthContext(user=session.user, session=session)

    def _issue(self, user: User) -> IssuedSession:
        now = self.clock.now()
        token = new_session_token()
        expires_at = now + timedelta(hours=self.settings.session_ttl_hours)
        self.sessions.create(user.id, hash_token(token), now, expires_at)
        return IssuedSession(user=user, token=token, expires_at=expires_at)

    def login(self, login: str, password: str, ip: str) -> IssuedSession:
        login = normalize_login(login)
        self.limiter.check_login(login, ip)
        user = self.users.by_login(login)
        # Always verify (against a dummy hash for unknown users) so timing does not reveal which accounts exist.
        valid = self.hasher.verify(password, user.password_hash if user and not user.is_demo else None)
        self.limiter.record_login(login, ip, succeeded=valid)
        if not valid or user is None:
            self.uow.commit()  # keep the failed attempt even though the request fails
            raise InvalidCredentials()
        user.last_login_at = self.clock.now()
        issued = self._issue(user)
        self.uow.commit()
        return issued

    def start_demo(self, role: Role, ip: str) -> IssuedSession:
        if not self.settings.demo_mode:
            raise NotFound("Demo modu kapalı.", code="demo_disabled")
        if role not in (Role.student, Role.teacher):
            raise InvalidInput("Demo hesabı yalnızca öğrenci ya da öğretmen olabilir.")
        self.limiter.check_demo(ip)
        user = self.users.add(User(role=role, display_name="Demo öğretmen" if role == Role.teacher else "Demo öğrenci", is_demo=True))
        self.limiter.record_demo(ip)
        issued = self._issue(user)
        self.uow.commit()
        return issued

    def logout(self, ctx: AuthContext) -> None:
        self.sessions.revoke(ctx.session, self.clock.now())
        self.uow.commit()

    def logout_everywhere(self, ctx: AuthContext) -> int:
        count = self.sessions.revoke_all_for_user(ctx.user.id, self.clock.now())
        self.uow.commit()
        return count

    def change_password(self, ctx: AuthContext, current_password: str, new_password: str) -> IssuedSession:
        """Ends every session of the user (all devices) and returns a fresh one for this device."""
        user = ctx.user
        if user.is_demo or not user.password_hash:
            raise PermissionDenied("Demo hesaplarının şifresi yoktur.", code="demo_account")
        if not self.hasher.verify(current_password, user.password_hash):
            raise InvalidCredentials("Mevcut şifren hatalı.", code="invalid_current_password")
        if new_password == current_password:
            raise InvalidInput("Yeni şifre eskisinden farklı olmalı.", code="password_unchanged")
        policy_for(user.role).check(new_password, context=password_context(user))
        user.password_hash = self.hasher.hash(new_password)
        user.must_change_password = False
        user.password_changed_at = self.clock.now()
        self.sessions.revoke_all_for_user(user.id, self.clock.now())
        issued = self._issue(user)
        self.uow.commit()
        return issued
