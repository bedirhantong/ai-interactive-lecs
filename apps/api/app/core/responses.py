"""Base response envelope for every endpoint.

Success:  {"success": true,  "data": <payload>, "meta": {"request_id": "...", "pagination": {...}?}}
Error:    {"success": false, "error": {"code", "message", "request_id", "details"?}}

Clients check `success`, then read `data` or `error.code`.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.request_context import get_request_id


class Pagination(BaseModel):
    limit: int
    next_cursor: int | None = Field(description="Pass as `cursor` to get the next page; null on the last page.")


class Meta(BaseModel):
    request_id: str | None = None
    pagination: Pagination | None = None


class ApiResponse[T](BaseModel):
    success: Literal[True] = True
    data: T
    meta: Meta


class ErrorBody(BaseModel):
    code: str = Field(description="Stable, machine-readable error code.")
    message: str = Field(description="Turkish message, safe to show to users.")
    request_id: str | None = None
    details: list[dict[str, Any]] | None = None


class ErrorResponse(BaseModel):
    success: Literal[False] = False
    error: ErrorBody


def ok[T](data: T, *, pagination: Pagination | None = None) -> ApiResponse[T]:
    return ApiResponse(data=data, meta=Meta(request_id=get_request_id(), pagination=pagination))


# Documented on every router so the OpenAPI schema shows the error envelope.
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {"model": ErrorResponse, "description": description}
    for status, description in {
        401: "Not authenticated",
        403: "Forbidden / CSRF / password change required",
        404: "Not found",
        409: "Conflict",
        412: "Revision conflict (If-Match does not match the current revision)",
        428: "Precondition required (send If-Match or If-None-Match)",
        413: "Payload too large",
        422: "Validation error",
        429: "Rate limited (see Retry-After)",
        500: "Internal error",
    }.items()
}
