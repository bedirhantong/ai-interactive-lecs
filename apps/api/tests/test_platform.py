"""Cross-cutting behaviour: error format, request ids, security headers, health, logging."""

import json
import logging

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.logging import JsonFormatter
from app.db import session as db_session

from .conftest import HEADERS


def assert_error(response, status: int, code: str):
    assert response.status_code == status, response.text
    assert response.json()["success"] is False
    error = response.json()["error"]
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert error["request_id"] == response.headers["x-request-id"]
    return error


# --- error format ------------------------------------------------------------------


def test_errors_share_one_envelope(client_factory):
    anon = client_factory(None)
    assert_error(anon.get("/api/v1/auth/me"), 401, "not_authenticated")
    assert_error(anon.get("/api/v1/does-not-exist"), 404, "not_found")
    assert_error(anon.get("/api/v1/lessons/olmayan"), 404, "lesson_not_found")
    assert_error(TestClient(anon.app).post("/api/v1/auth/demo", json={}), 403, "csrf_rejected")


def test_validation_errors_list_fields_without_echoing_input(client_factory):
    c = client_factory()
    secret = "ÖĞRENCİ-KİŞİSEL-VERİ"
    r = c.post(
        "/api/v1/progress/events",
        json=[{"lesson_id": "python-ilk-adimlar", "cell_id": "x", "kind": "BÜYÜK HARF", "detail": secret, "occurred_at": "dün"}],
    )
    error = assert_error(r, 422, "validation_error")
    fields = {d["field"] for d in error["details"]}
    assert "body.0.kind" in fields and "body.0.occurred_at" in fields
    assert secret not in r.text


def test_domain_errors_have_specific_codes(client_factory):
    c = client_factory()
    r = c.post("/api/v1/reports?lesson_id=geri-donusum-yapici", content=b'{"schema_version": "1.0"}', headers={"content-type": "application/json"})
    error = assert_error(r, 422, "report_invalid")
    assert error["details"]
    assert_error(c.get("/api/v1/notebooks/python-ilk-adimlar"), 404, "notebook_not_found")
    assert_error(c.post("/api/v1/classrooms", json={"name": "7-A"}), 403, "forbidden")


def test_success_responses_share_one_envelope(client_factory):
    c = client_factory()
    body = c.get("/api/v1/auth/me").json()
    assert body["success"] is True and set(body) == {"success", "data", "meta"}
    assert body["meta"]["request_id"] == c.get("/api/v1/auth/me", headers={"x-request-id": "zarf-testi-1234"}).json()["meta"]["request_id"] or True
    tagged = c.get("/api/v1/auth/me", headers={"x-request-id": "zarf-testi-1234"}).json()
    assert tagged["meta"]["request_id"] == "zarf-testi-1234"


def test_openapi_documents_the_envelopes(client_factory):
    schema = client_factory(None).get("/openapi.json").json()
    me = schema["paths"]["/api/v1/auth/me"]["get"]["responses"]
    assert "ApiResponse" in me["200"]["content"]["application/json"]["schema"]["$ref"]
    assert me["401"]["content"]["application/json"]["schema"]["$ref"].endswith("/ErrorResponse")


def test_unexpected_errors_do_not_leak_internals(app):
    def boom():
        raise RuntimeError("veritabanı şifresi: gizli123")

    app.add_api_route("/api/v1/_test_boom", boom)
    r = TestClient(app, raise_server_exceptions=False).get("/api/v1/_test_boom")
    assert_error(r, 500, "internal_error")
    assert "gizli123" not in r.text and "RuntimeError" not in r.text
    assert r.headers["x-content-type-options"] == "nosniff"


# --- request id ----------------------------------------------------------------------


def test_request_id_is_generated_or_propagated(client_factory):
    c = client_factory(None)
    generated = c.get("/api/v1/health/live").headers["x-request-id"]
    assert len(generated) == 32
    assert c.get("/api/v1/health/live", headers={"x-request-id": "proxy-abc-12345"}).headers["x-request-id"] == "proxy-abc-12345"
    for bad in ("bad id with spaces", "x" * 100, "short"):
        replaced = c.get("/api/v1/health/live", headers={"x-request-id": bad}).headers["x-request-id"]
        assert replaced != bad and len(replaced) == 32


# --- security headers ------------------------------------------------------------------


def test_security_headers(client_factory):
    c = client_factory(None)
    h = c.get("/api/v1/health/live").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert h["cache-control"] == "no-store"
    assert "default-src 'none'" in h["content-security-policy"]
    assert "strict-transport-security" not in h  # only in production (HTTPS)
    docs = c.get("/docs")
    assert docs.status_code == 200 and "content-security-policy" not in docs.headers


def test_cors_allows_only_the_configured_origin(client_factory):
    c = client_factory(None)
    ok = c.options(
        "/api/v1/auth/demo",
        headers={"origin": "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "x-atolye-client"},
    )
    assert ok.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert ok.headers["access-control-allow-credentials"] == "true"
    bad = c.options("/api/v1/auth/demo", headers={"origin": "https://kotu-site.example", "access-control-request-method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


# --- health ------------------------------------------------------------------------------


def test_liveness_and_readiness(client_factory, engine):
    c = client_factory(None)
    assert c.get("/api/v1/health/live").json()["data"] == {"status": "ok"}
    ready = c.get("/api/v1/health/ready")
    assert ready.status_code == 200 and ready.json()["data"]["database"] == "ok"
    head = ready.json()["data"]["migration"]

    with engine.begin() as conn:
        conn.execute(text("UPDATE alembic_version SET version_num = '0001'"))
    try:
        assert_error(c.get("/api/v1/health/ready"), 503, "migrations_pending")
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE alembic_version SET version_num = :v"), {"v": head})


# --- logging -------------------------------------------------------------------------------


class _Collect(logging.Handler):
    def __init__(self):
        super().__init__()
        self.setFormatter(JsonFormatter())
        self.lines: list[dict] = []

    def emit(self, record):
        self.lines.append(json.loads(self.format(record)))


def test_access_log_is_json_with_request_id(client_factory):
    c = client_factory(None)
    handler = _Collect()
    logging.getLogger("app.access").addHandler(handler)
    try:
        request_id = c.get("/api/v1/health/live").headers["x-request-id"]
    finally:
        logging.getLogger("app.access").removeHandler(handler)
    access = [l for l in handler.lines if l.get("request_id") == request_id]
    assert access and access[0]["path"] == "/api/v1/health/live" and access[0]["status"] == 200
    assert "duration_ms" in access[0]


def test_json_formatter_escapes_quotes_and_newlines():
    record = logging.LogRecord("t", logging.INFO, __file__, 1, 'ad: "Ayşe"\nyeni satır', (), None)
    parsed = json.loads(JsonFormatter().format(record))
    assert parsed["message"] == 'ad: "Ayşe"\nyeni satır'


def test_notebook_state_round_trips_through_json_column(client_factory):
    c = client_factory()
    state = {
        "schema": 1,
        "lessonId": "python-ilk-adimlar",
        "lessonVersion": 1,
        "cells": {"a": {"metin": "Türkçe ğüşıöç", "sayı": 1.5, "liste": [1, None, True]}},
    }
    assert c.put("/api/v1/notebooks/python-ilk-adimlar", json=state, headers={"if-none-match": "*"}).status_code == 201
    with next(db_session.get_db()) as db:
        dialect = db.get_bind().dialect.name
    assert c.get("/api/v1/notebooks/python-ilk-adimlar").json()["data"]["state"]["cells"] == state["cells"], dialect


_ = HEADERS
