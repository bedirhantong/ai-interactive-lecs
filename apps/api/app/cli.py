"""Administrative commands. Credentials are never hardcoded.

    python -m app.cli create-user --role admin --email admin@okul.example --name "Yönetici"
    python -m app.cli cleanup        # run daily (cron / scheduled job)

create-user reads the password interactively (or from ATOLYE_NEW_USER_PASSWORD
for automation) and applies the staff password policy.
"""

import argparse
import getpass
import os
import sys

from app.core.clock import SystemClock
from app.core.config import get_settings
from app.db.session import get_db
from app.domain.errors import DomainError
from app.domain.passwords import policy_for
from app.domain.usernames import normalize_login
from app.models import Role, User
from app.repositories.attempts import AttemptRepository
from app.repositories.audit import AuditRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.security.hashing import ScryptHasher
from app.services.maintenance import MaintenanceService


def create_user(role: str, email: str, name: str) -> None:
    password = os.environ.get("ATOLYE_NEW_USER_PASSWORD") or getpass.getpass("Şifre: ")
    email = normalize_login(email)
    user_role = Role(role)
    try:
        policy_for(user_role).check(password, context=[email.split("@")[0], *name.split()])
    except DomainError as exc:
        sys.exit("\n".join([exc.message, *(d["message"] for d in exc.details or [])]))
    with next(get_db()) as db:
        users = UserRepository(db)
        if users.email_exists(email):
            sys.exit("Bu e-posta zaten kayıtlı.")
        users.add(User(role=user_role, email=email, display_name=name, password_hash=ScryptHasher().hash(password)))
        db.commit()
    print(f"{role} oluşturuldu: {email}")


def cleanup() -> None:
    with next(get_db()) as db:
        service = MaintenanceService(
            SessionRepository(db), AttemptRepository(db), UserRepository(db), AuditRepository(db), get_settings(), SystemClock(), db
        )
        result = service.cleanup()
    print(
        f"Silinen: {result.sessions} oturum, {result.attempts} giriş denemesi, {result.demo_users} demo hesabı, "
        f"{result.audit_events} eski erişim kaydı, {result.inactive_students} uzun süre girmeyen öğrenci hesabı"
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    cu = sub.add_parser("create-user", help="Yönetici ya da öğretmen hesabı oluştur")
    cu.add_argument("--role", choices=["teacher", "admin"], required=True)
    cu.add_argument("--email", required=True)
    cu.add_argument("--name", required=True)
    sub.add_parser("cleanup", help="Süresi dolmuş oturumları, eski giriş denemelerini, demo hesaplarını ve saklama süresi dolan kayıtları sil")
    args = parser.parse_args()
    if args.command == "create-user":
        create_user(args.role, args.email, args.name)
    elif args.command == "cleanup":
        cleanup()


if __name__ == "__main__":
    main()
