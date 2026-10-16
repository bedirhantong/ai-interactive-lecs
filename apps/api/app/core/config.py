"""Application settings (environment variables, see .env.example)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]
DEV_SECRET = "dev-only-insecure-secret-change-me"  # noqa: S105 - placeholder; rejected in production (see _safe_production)


class Settings(BaseSettings):
    # env_ignore_empty: "ATOLYE_X=" (empty) means "not set", so optional values fall back to defaults.
    model_config = SettingsConfigDict(env_file=".env", env_prefix="ATOLYE_", extra="ignore", env_ignore_empty=True)

    env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://atolye:atolye@localhost:5433/atolye"
    content_dir: Path = REPO_ROOT / "content"
    # Comma-separated list of frontend origins allowed to call the API with cookies.
    allowed_origins: str = "http://localhost:3000"
    # Demo mode creates throwaway accounts without passwords. Never in production.
    demo_mode: bool = False
    session_ttl_hours: int = 12
    cookie_secure: bool = False
    max_notebook_bytes: int = 512 * 1024
    max_report_bytes: int = 200 * 1024
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    # Keys HMAC hashes of login names and IP addresses. Must be a long random value in production:
    #   python -c "import secrets; print(secrets.token_urlsafe(48))"
    secret_key: SecretStr = SecretStr(DEV_SECRET)

    # Brute-force protection (counted in the database, so it works across API instances).
    login_window_minutes: int = 15
    login_max_failures_per_account: int = 5
    login_max_failures_per_ip: int = 30
    demo_max_per_ip_per_hour: int = 20

    # Data retention (KVKK). Audit events are kept for accountability, then deleted.
    audit_retention_days: int = 365
    # Delete student accounts with no login for this many days. Disabled by default: the school
    # (data controller) decides this period; set it only after that decision.
    inactive_student_retention_days: int | None = None

    @model_validator(mode="after")
    def _safe_production(self) -> "Settings":
        if self.env == "production":
            if self.demo_mode:
                raise ValueError("ATOLYE_DEMO_MODE cannot be enabled when ATOLYE_ENV=production")
            if not self.cookie_secure:
                raise ValueError("ATOLYE_COOKIE_SECURE must be true in production")
            secret = self.secret_key.get_secret_value()
            if secret == DEV_SECRET or len(secret) < 32:
                raise ValueError("ATOLYE_SECRET_KEY must be set to a random value of at least 32 characters in production")
        return self

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
