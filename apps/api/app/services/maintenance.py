"""Housekeeping and data retention, run on a schedule (cron) with `python -m app.cli cleanup`."""

from dataclasses import dataclass
from datetime import timedelta

from app.core.clock import Clock
from app.core.config import Settings
from app.core.uow import UnitOfWork
from app.repositories.attempts import AttemptRepository
from app.repositories.audit import AuditRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository


@dataclass(frozen=True)
class CleanupResult:
    sessions: int
    attempts: int
    demo_users: int
    audit_events: int
    inactive_students: int


class MaintenanceService:
    def __init__(
        self,
        sessions: SessionRepository,
        attempts: AttemptRepository,
        users: UserRepository,
        audit: AuditRepository,
        settings: Settings,
        clock: Clock,
        uow: UnitOfWork,
    ):
        self.sessions = sessions
        self.attempts = attempts
        self.users = users
        self.audit = audit
        self.settings = settings
        self.clock = clock
        self.uow = uow

    def cleanup(
        self,
        *,
        session_grace: timedelta = timedelta(days=1),
        attempt_retention: timedelta = timedelta(days=7),
        demo_ttl: timedelta = timedelta(days=1),
    ) -> CleanupResult:
        now = self.clock.now()
        inactive = 0
        if self.settings.inactive_student_retention_days:
            # Opt-in: the school decides this period. Accounts are deleted with all their data.
            for student in self.users.inactive_students_before(now - timedelta(days=self.settings.inactive_student_retention_days)):
                self.users.delete(student)
                inactive += 1
        result = CleanupResult(
            sessions=self.sessions.delete_stale(now - session_grace),
            attempts=self.attempts.delete_older_than(now - attempt_retention),
            demo_users=self.users.delete_demo_users_created_before(now - demo_ttl),
            audit_events=self.audit.delete_older_than(now - timedelta(days=self.settings.audit_retention_days)),
            inactive_students=inactive,
        )
        self.uow.commit()
        return result
