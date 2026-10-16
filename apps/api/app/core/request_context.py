"""Per-request context (request id) shared by middleware, logging and error handlers."""

import re
import uuid
from contextvars import ContextVar

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_VALID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def new_request_id(incoming: str | None) -> str:
    """Reuse a well-formed incoming X-Request-ID (e.g. from a proxy), otherwise generate one."""
    return incoming if incoming and _VALID.match(incoming) else uuid.uuid4().hex


def set_request_id(value: str | None):
    return _request_id.set(value)


def reset_request_id(token) -> None:
    _request_id.reset(token)


def get_request_id() -> str | None:
    return _request_id.get()
