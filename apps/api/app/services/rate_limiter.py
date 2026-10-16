"""Brute-force protection for login and demo-account creation.

Counts are kept in the database (AuthAttempt), so limits hold across API
instances without Redis. Login is limited per account (protects one student
from guessing) and per IP (protects against spraying many accounts). There is
no permanent account lockout: that would let a classmate lock someone out.
"""

from datetime import datetime, timedelta

from app.core.clock import Clock, as_utc
from app.core.config import Settings
from app.domain.errors import RateLimited
from app.repositories.attempts import AttemptRepository
from app.security.tokens import KeyedHasher

LOGIN, DEMO = "login", "demo"


class AttemptLimiter:
    def __init__(self, attempts: AttemptRepository, hasher: KeyedHasher, clock: Clock, settings: Settings):
        self.attempts = attempts
        self.hasher = hasher
        self.clock = clock
        self.settings = settings

    def _key(self, login: str) -> str:
        return self.hasher.digest(f"login:{login}")

    def _ip(self, ip: str) -> str:
        return self.hasher.digest(f"ip:{ip}")

    @staticmethod
    def _retry_after(times: list[datetime], limit: int, window: timedelta, now: datetime) -> int:
        """Seconds until enough of the counted attempts fall out of the window."""
        oldest_relevant = as_utc(times[-limit])
        return int((oldest_relevant + window - now).total_seconds()) + 1

    def check_login(self, login: str, ip: str) -> None:
        now = self.clock.now()
        window = timedelta(minutes=self.settings.login_window_minutes)
        since = now - window
        per_account = self.attempts.failure_times_for_key(LOGIN, self._key(login), since)
        if len(per_account) >= self.settings.login_max_failures_per_account:
            raise RateLimited(
                self._retry_after(per_account, self.settings.login_max_failures_per_account, window, now),
                "Bu hesap için çok fazla hatalı deneme yapıldı. Birkaç dakika sonra tekrar dene.",
                code="too_many_login_attempts",
            )
        per_ip = self.attempts.times_for_ip(LOGIN, self._ip(ip), since, failures_only=True)
        if len(per_ip) >= self.settings.login_max_failures_per_ip:
            raise RateLimited(
                self._retry_after(per_ip, self.settings.login_max_failures_per_ip, window, now),
                "Bu ağdan çok fazla hatalı giriş denemesi yapıldı. Birkaç dakika sonra tekrar dene.",
                code="too_many_login_attempts",
            )

    def record_login(self, login: str, ip: str, succeeded: bool) -> None:
        self.attempts.record(LOGIN, self._key(login), self._ip(ip), succeeded, self.clock.now())

    def check_demo(self, ip: str) -> None:
        now = self.clock.now()
        window = timedelta(hours=1)
        recent = self.attempts.times_for_ip(DEMO, self._ip(ip), now - window, failures_only=False)
        if len(recent) >= self.settings.demo_max_per_ip_per_hour:
            raise RateLimited(self._retry_after(recent, self.settings.demo_max_per_ip_per_hour, window, now), code="too_many_demo_accounts")

    def record_demo(self, ip: str) -> None:
        self.attempts.record(DEMO, self._ip(ip), self._ip(ip), True, self.clock.now())
