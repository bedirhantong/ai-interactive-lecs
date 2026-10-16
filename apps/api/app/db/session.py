from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def enable_sqlite_foreign_keys(engine: Engine) -> None:
    """SQLite ignores foreign keys (and ON DELETE CASCADE) unless asked. PostgreSQL always enforces them."""
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_app_engine(url: str) -> Engine:
    engine = create_engine(url, pool_pre_ping=True)
    enable_sqlite_foreign_keys(engine)
    return engine


def configure(engine: Engine) -> None:
    global _engine, _factory
    _engine = engine
    _factory = sessionmaker(bind=engine, expire_on_commit=False)


def get_engine() -> Engine:
    if _engine is None:
        configure(create_app_engine(get_settings().database_url))
    if _engine is None:  # explicit check: asserts are stripped under `python -O`
        raise RuntimeError("Database engine is not configured")
    return _engine


def get_db() -> Iterator[Session]:
    get_engine()
    if _factory is None:
        raise RuntimeError("Database session factory is not configured")
    with _factory() as session:
        yield session
