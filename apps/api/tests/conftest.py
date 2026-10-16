"""Test setup.

By default tests run on in-memory SQLite (fast, no services needed).
Set ATOLYE_TEST_DATABASE_URL to run the same tests against PostgreSQL; the
schema is then built with the real Alembic migrations, which verifies them:

    ATOLYE_TEST_DATABASE_URL=postgresql+psycopg://atolye:atolye@localhost:5433/atolye_test pytest
"""

import os

os.environ.update({"ATOLYE_ENV": "test", "ATOLYE_DEMO_MODE": "true", "ATOLYE_ALLOWED_ORIGINS": "http://localhost:3000"})

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from alembic.runtime.migration import MigrationContext  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base  # noqa: E402

HEADERS = {"x-atolye-client": "1", "origin": "http://localhost:3000"}
TEST_DB = os.environ.get("ATOLYE_TEST_DATABASE_URL")
API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def alembic_config() -> Config:
    cfg = Config(os.path.join(API_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(API_DIR, "migrations"))
    return cfg


@pytest.fixture(scope="session")
def engine():
    if not TEST_DB:
        eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        db_session.enable_sqlite_foreign_keys(eng)  # so ON DELETE CASCADE is really tested
        Base.metadata.create_all(eng)
        # Mark the in-memory schema as fully migrated so /health/ready behaves as in a real deployment.
        with eng.begin() as conn:
            MigrationContext.configure(conn).stamp(ScriptDirectory.from_config(alembic_config()), "head")
        yield eng
        return
    if "test" not in TEST_DB.rsplit("/", 1)[-1]:
        pytest.exit("Refusing to run: ATOLYE_TEST_DATABASE_URL must point to a database whose name contains 'test'.")
    os.environ["ATOLYE_DATABASE_URL"] = TEST_DB
    get_settings.cache_clear()
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    eng = create_engine(TEST_DB)
    yield eng
    eng.dispose()


@pytest.fixture
def app(engine):
    get_settings.cache_clear()
    db_session.configure(engine)
    yield create_app()
    # Clean slate for the next test.
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
            conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        else:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(table.delete())


@pytest.fixture
def client_factory(app):
    """Each call returns an independent client (its own cookie jar = its own user)."""

    def make(role: str | None = "student") -> TestClient:
        c = TestClient(app, headers=HEADERS)
        if role:
            r = c.post("/api/v1/auth/demo", json={"role": role})
            assert r.status_code == 201, r.text
        return c

    return make


def data(response):
    """Unwrap the success envelope, asserting its shape."""
    body = response.json()
    assert body["success"] is True, body
    assert "request_id" in body["meta"]
    return body["data"]


def error(response, status: int, code: str):
    body = response.json()
    assert response.status_code == status, body
    assert body["success"] is False and body["error"]["code"] == code, body
    return body["error"]


class FakeClock:
    def __init__(self):
        from datetime import UTC, datetime

        self.current = datetime.now(UTC)

    def now(self):
        return self.current

    def advance(self, **kwargs):
        from datetime import timedelta

        self.current += timedelta(**kwargs)


@pytest.fixture
def clock(app):
    from app.api.deps import get_clock

    fake = FakeClock()
    app.dependency_overrides[get_clock] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_clock, None)


@pytest.fixture
def settings_override(app):
    """Call with keyword arguments to change settings for one test (e.g. lower rate limits)."""
    from app.core.config import get_settings

    def apply(**changes):
        base = get_settings()
        app.dependency_overrides[get_settings] = lambda: base.model_copy(update=changes)

    yield apply
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
def make_user(engine):
    """Insert a user with a real password (teacher/admin/student)."""
    from sqlalchemy.orm import Session

    from app.models import Role, User
    from app.security.hashing import ScryptHasher

    hasher = ScryptHasher()

    def make(role="teacher", email=None, username=None, password="dogru-uzun-sifre-42", must_change=False, name="Test Kullanıcı"):
        with Session(engine) as db:
            user = User(
                role=Role(role),
                email=email,
                username=username,
                display_name=name,
                password_hash=hasher.hash(password),
                must_change_password=must_change,
            )
            db.add(user)
            db.commit()
            return user.id

    return make


def login(app, login_name: str, password: str):
    c = TestClient(app, headers=HEADERS)
    return c, c.post("/api/v1/auth/login", json={"login": login_name, "password": password})
