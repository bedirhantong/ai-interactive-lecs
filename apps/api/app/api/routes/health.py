"""Liveness and readiness probes (for load balancers, deploy tools and you)."""

from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DB
from app.core.config import get_settings
from app.core.errors import error_response
from app.core.responses import ApiResponse, ok

router = APIRouter(prefix="/health", tags=["health"])
API_DIR = Path(__file__).resolve().parents[3]


@lru_cache
def migration_head() -> str | None:
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "migrations"))
    return ScriptDirectory.from_config(cfg).get_current_head()


@router.get("/live", response_model=ApiResponse[dict])
def live():
    """The process is up. Does not touch the database."""
    return ok({"status": "ok"})


@router.get("/ready", response_model=None)
def ready(db: DB):
    """Ready to serve traffic: the database answers and its schema is at the latest migration."""
    try:
        db.execute(text("SELECT 1"))
        current = MigrationContext.configure(db.connection()).get_current_revision()
    except Exception:  # noqa: BLE001 - any database failure means "not ready"
        return error_response(503, "database_unavailable", "Veritabanına ulaşılamıyor.")
    if current != migration_head():
        message = f"Veritabanı şeması güncel değil ({current} ≠ {migration_head()}). `alembic upgrade head` çalıştır."
        return error_response(503, "migrations_pending", message)
    return ok({"status": "ready", "database": "ok", "migration": current, "demo_mode": get_settings().demo_mode})
