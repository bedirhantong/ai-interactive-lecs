import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.db import session as db_session
from app.models import TrainingReport

from .conftest import data, error, login

FIXTURE = Path(__file__).resolve().parents[2] / "web" / "tests" / "fixtures" / "akilli-geri-donusum-colab-report.json"
REPORT = json.loads(FIXTURE.read_text(encoding="utf-8"))
JSON = {"content-type": "application/json"}


def notebook_state(lesson_id="python-ilk-adimlar", version=1):
    return {
        "schema": 1,
        "lessonId": lesson_id,
        "lessonVersion": version,
        "savedAt": "",
        "cells": {},
        "completions": {},
        "hintLevels": {},
        "evidence": [],
    }


def event(lesson="python-ilk-adimlar", cell="ilk-kod", kind="cell-completed", client_event_id=None):
    import uuid

    return {
        "client_event_id": client_event_id or uuid.uuid4().hex,
        "lesson_id": lesson,
        "cell_id": cell,
        "kind": kind,
        "occurred_at": "2026-10-16T10:00:00Z",
    }


# --- configuration & security -------------------------------------------------


def test_production_settings_are_guarded():
    with pytest.raises(ValidationError):
        Settings(env="production", demo_mode=True, cookie_secure=True, secret_key="x" * 40)
    with pytest.raises(ValidationError):
        Settings(env="production", demo_mode=False, cookie_secure=False, secret_key="x" * 40)
    with pytest.raises(ValidationError):  # default/short secret
        Settings(env="production", demo_mode=False, cookie_secure=True)
    assert Settings(env="production", demo_mode=False, cookie_secure=True, secret_key="x" * 40)


def test_empty_environment_variables_mean_not_set(monkeypatch):
    monkeypatch.setenv("ATOLYE_INACTIVE_STUDENT_RETENTION_DAYS", "")
    monkeypatch.setenv("ATOLYE_AUDIT_RETENTION_DAYS", "")
    settings = Settings()
    assert settings.inactive_student_retention_days is None and settings.audit_retention_days == 365


def test_there_is_no_code_execution_endpoint(app):
    paths = [getattr(route, "path", "") for route in app.routes]
    assert not any(word in p for p in paths for word in ("execute", "/run", "kernel", "eval"))


def test_state_changing_requests_need_the_client_header(client_factory):
    c = client_factory(None)
    error(TestClient(c.app).post("/api/v1/auth/demo", json={"role": "student"}), 403, "csrf_rejected")
    r = TestClient(c.app, headers={"x-atolye-client": "1", "origin": "https://kotu-site.example"}).post("/api/v1/auth/demo", json={})
    error(r, 403, "csrf_rejected")


# --- auth -----------------------------------------------------------------------


def test_demo_session_me_logout(client_factory):
    c = client_factory("student")
    me = data(c.get("/api/v1/auth/me"))
    assert me["role"] == "student" and me["is_demo"] is True and me["must_change_password"] is False
    token = c.cookies.get("atolye_session")
    assert data(c.post("/api/v1/auth/logout"))["sessions_ended"] == 1
    error(c.get("/api/v1/auth/me"), 401, "not_authenticated")  # cookie cleared
    c.cookies.set("atolye_session", token)
    error(c.get("/api/v1/auth/me"), 401, "session_expired")  # and the old token is revoked server-side


def test_password_login_sets_an_httponly_cookie(app, make_user):
    make_user("teacher", email="ayse@okul.example", password="dogru-uzun-sifre-42")
    _, bad = login(app, "ayse@okul.example", "yanlis")
    error(bad, 401, "invalid_credentials")
    _, good = login(app, "AYSE@okul.example ", "dogru-uzun-sifre-42")  # case and whitespace insensitive
    assert data(good)["user"]["role"] == "teacher"
    assert "httponly" in good.headers["set-cookie"].lower()


def test_demo_accounts_cannot_log_in_with_a_password(client_factory, app):
    c = client_factory("student")
    me = data(c.get("/api/v1/auth/me"))
    _, r = login(app, me["id"], "herhangi-bir-sifre")
    error(r, 401, "invalid_credentials")


def test_endpoints_require_a_session(client_factory):
    c = client_factory(None)
    error(c.get("/api/v1/notebooks/python-ilk-adimlar"), 401, "not_authenticated")
    error(c.put("/api/v1/notebooks/python-ilk-adimlar", json=notebook_state()), 401, "not_authenticated")


def test_demo_disabled(client_factory, settings_override):
    settings_override(demo_mode=False)
    error(client_factory(None).post("/api/v1/auth/demo", json={"role": "student"}), 404, "demo_disabled")


# --- notebooks & progress ----------------------------------------------------------


def test_notebook_snapshots_are_private_to_their_owner(client_factory):
    alice, bob = client_factory(), client_factory()
    state = notebook_state()
    state["cells"] = {"ilk-kod": {"kind": "code", "source": "print('Alice')"}}
    assert data(alice.put("/api/v1/notebooks/python-ilk-adimlar", json=state, headers={"if-none-match": "*"}))["lesson_version"] == 1
    assert data(alice.get("/api/v1/notebooks/python-ilk-adimlar"))["state"]["cells"]["ilk-kod"]["source"] == "print('Alice')"
    error(bob.get("/api/v1/notebooks/python-ilk-adimlar"), 404, "notebook_not_found")


def test_notebook_envelope_and_size_are_checked(client_factory):
    c = client_factory()
    error(
        c.put("/api/v1/notebooks/python-ilk-adimlar", json=notebook_state("baska-ders"), headers={"if-none-match": "*"}),
        422,
        "notebook_lesson_mismatch",
    )
    error(
        c.put("/api/v1/notebooks/python-ilk-adimlar", json=notebook_state(version=99), headers={"if-none-match": "*"}), 422, "invalid_lesson_version"
    )
    error(c.put("/api/v1/notebooks/olmayan-ders", json=notebook_state("olmayan-ders"), headers={"if-none-match": "*"}), 404, "lesson_not_found")
    big = notebook_state()
    big["cells"] = {"x": {"source": "a" * 600_000}}
    error(c.put("/api/v1/notebooks/python-ilk-adimlar", json=big, headers={"if-none-match": "*"}), 413, "payload_too_large")


def test_progress_events_are_self_reported_and_paginated(client_factory):
    c = client_factory()
    events = [event(cell=f"c-{i}") for i in range(5)]
    assert data(c.post("/api/v1/progress/events", json=events))["stored"] == 5
    first = c.get("/api/v1/progress/events?limit=3").json()
    assert len(first["data"]) == 3 and first["meta"]["pagination"]["next_cursor"] is not None
    assert all(e["verification"] == "self_reported" for e in first["data"])
    rest = c.get(f"/api/v1/progress/events?limit=3&cursor={first['meta']['pagination']['next_cursor']}").json()
    assert len(rest["data"]) == 2 and rest["meta"]["pagination"]["next_cursor"] is None
    error(c.post("/api/v1/progress/events", json=[event(lesson="olmayan-ders")]), 422, "unknown_lesson")


# --- Colab reports -------------------------------------------------------------------


def test_real_colab_report_is_accepted_and_marked_self_reported(client_factory):
    c = client_factory()
    stored = data(c.post("/api/v1/reports?lesson_id=geri-donusum-yapici", content=json.dumps(REPORT), headers=JSON))
    assert stored["verification"] == "self_reported"
    assert stored["test_accuracy"] == REPORT["test_metrics"]["accuracy"]
    assert len(data(c.get("/api/v1/reports"))) == 1


@pytest.mark.parametrize(
    ("mutate", "lesson", "code"),
    [
        (lambda r: r.update(schema_version="2.0"), "geri-donusum-yapici", "report_invalid"),
        (lambda r: r["test_metrics"].update(accuracy=0.999), "geri-donusum-yapici", "report_invalid"),
        (lambda r: r.update(selected_experiment="yok"), "geri-donusum-yapici", "report_invalid"),
        (lambda r: r.update(project_id="baska-proje"), "geri-donusum-yapici", "report_project_mismatch"),
        (lambda r: r.update(notebook_version="9.0.0"), "geri-donusum-yapici", "report_version_incompatible"),
        (lambda r: None, "python-ilk-adimlar", "lesson_has_no_colab"),
    ],
)
def test_invalid_reports_are_rejected(client_factory, mutate, lesson, code):
    c = client_factory()
    report = json.loads(json.dumps(REPORT))
    mutate(report)
    error(c.post(f"/api/v1/reports?lesson_id={lesson}", content=json.dumps(report), headers=JSON), 422, code)


def test_oversized_report_is_rejected(client_factory):
    c = client_factory()
    error(c.post("/api/v1/reports?lesson_id=geri-donusum-yapici", content=b"{" + b" " * 300_000 + b"}", headers=JSON), 413, "payload_too_large")


def test_unknown_report_fields_are_dropped(client_factory):
    c = client_factory()
    report = {**REPORT, "malicious": {"__class__": "os.system"}}
    assert c.post("/api/v1/reports?lesson_id=geri-donusum-yapici", content=json.dumps(report), headers=JSON).status_code == 201
    with next(db_session.get_db()) as db:
        stored = db.query(TrainingReport).one().report
    assert "malicious" not in stored


# --- classrooms (join-code flow) ---------------------------------------------------------


def test_classroom_flow_and_access_boundaries(client_factory):
    teacher, other_teacher = client_factory("teacher"), client_factory("teacher")
    student, outsider = client_factory("student"), client_factory("student")
    student_id = data(student.get("/api/v1/auth/me"))["id"]

    error(student.post("/api/v1/classrooms", json={"name": "7-A"}), 403, "forbidden")
    room = data(teacher.post("/api/v1/classrooms", json={"name": "7-A"}))
    rid, code = room["id"], room["join_code"]

    # Join → pending: the student sees nothing yet, the teacher sees no progress yet.
    assert data(student.post("/api/v1/classrooms/join", json={"code": code.lower()}))["status"] == "pending"
    error(student.get(f"/api/v1/classrooms/{rid}/assignments"), 404, "classroom_not_found")
    error(teacher.get(f"/api/v1/classrooms/{rid}/students/{student_id}/progress"), 404, "student_not_in_classroom")

    # Another teacher cannot see or manage this classroom.
    error(other_teacher.get(f"/api/v1/classrooms/{rid}/members"), 404, "classroom_not_found")
    error(other_teacher.post(f"/api/v1/classrooms/{rid}/members/{student_id}/approve"), 404, "classroom_not_found")

    # Approve, assign, review evidence.
    assert data(teacher.post(f"/api/v1/classrooms/{rid}/members/{student_id}/approve"))["status"] == "active"
    assert teacher.post(f"/api/v1/classrooms/{rid}/assignments", json={"lesson_id": "geri-donusum-yapici"}).status_code == 201
    error(teacher.post(f"/api/v1/classrooms/{rid}/assignments", json={"lesson_id": "olmayan"}), 422, "unknown_lesson")
    assert [a["lesson_id"] for a in data(student.get(f"/api/v1/classrooms/{rid}/assignments"))] == ["geri-donusum-yapici"]
    assert data(student.get("/api/v1/classrooms"))[0]["join_code"] is None

    student.post("/api/v1/progress/events", json=[event("geri-donusum-yapici", "egit", "model-trained")])
    student.post("/api/v1/reports?lesson_id=geri-donusum-yapici", content=json.dumps(REPORT), headers=JSON)
    progress = teacher.get(f"/api/v1/classrooms/{rid}/students/{student_id}/progress").json()
    assert progress["data"][0]["kind"] == "model-trained" and progress["meta"]["pagination"]["limit"] == 50
    assert len(data(teacher.get(f"/api/v1/classrooms/{rid}/students/{student_id}/reports"))) == 1

    # Outsiders and non-members stay invisible.
    outsider_id = data(outsider.get("/api/v1/auth/me"))["id"]
    error(outsider.get(f"/api/v1/classrooms/{rid}/assignments"), 404, "classroom_not_found")
    error(teacher.get(f"/api/v1/classrooms/{rid}/students/{outsider_id}/progress"), 404, "student_not_in_classroom")
    error(other_teacher.get(f"/api/v1/classrooms/{rid}/students/{student_id}/reports"), 404, "classroom_not_found")

    # Removing a member hides the class again.
    assert data(teacher.delete(f"/api/v1/classrooms/{rid}/members/{student_id}")) is None
    error(student.get(f"/api/v1/classrooms/{rid}/assignments"), 404, "classroom_not_found")


def test_teachers_cannot_join_classrooms(client_factory):
    teacher, other = client_factory("teacher"), client_factory("teacher")
    code = data(teacher.post("/api/v1/classrooms", json={"name": "8-B"}))["join_code"]
    error(other.post("/api/v1/classrooms/join", json={"code": code}), 403, "forbidden")


def test_lessons_catalog_exposes_versions_and_labs(client_factory):
    lessons = {lesson["id"]: lesson for lesson in data(client_factory(None).get("/api/v1/lessons"))}
    assert lessons["geri-donusum-yapici"]["labs"] == ["visual", "python", "colab"]
    assert lessons["geri-donusum-yapici"]["version"] == 2
