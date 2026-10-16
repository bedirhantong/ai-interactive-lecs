"""Step 4: KVKK data subject rights — export, rectification, erasure, access log, retention."""

import json
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import AuditEvent, AuthSession, Classroom, ClassroomMembership, ProgressEvent, StudentNotebook, TrainingReport, User
from app.repositories.attempts import AttemptRepository
from app.repositories.audit import AuditRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.services.maintenance import MaintenanceService

from .conftest import data, error, login

REPORT = (Path(__file__).resolve().parents[2] / "web/tests/fixtures/akilli-geri-donusum-colab-report.json").read_text(encoding="utf-8")
STRONG = "mavi-bisiklet-yaz-2026"
JSON = {"content-type": "application/json"}


def count(engine, model, **where) -> int:
    with Session(engine) as db:
        query = select(func.count()).select_from(model)
        for column, value in where.items():
            query = query.where(getattr(model, column) == value)
        return db.scalar(query)


@pytest.fixture
def class_with_student(app, client_factory):
    """A teacher, their classroom, and a teacher-created student who has set a password and has some data."""
    teacher = client_factory("teacher")
    room_id = data(teacher.post("/api/v1/classrooms", json={"name": "7-A"}))["id"]
    cred = data(teacher.post(f"/api/v1/classrooms/{room_id}/students", json={"display_name": "Ayşe K."}))
    student, _ = login(app, cred["login"], cred["one_time_password"])
    data(student.post("/api/v1/auth/password", json={"current_password": cred["one_time_password"], "new_password": STRONG}))
    state = {"schema": 1, "lessonId": "python-ilk-adimlar", "lessonVersion": 1, "cells": {"ilk-kod": {"source": "print('benim kodum')"}}}
    data(student.put("/api/v1/notebooks/python-ilk-adimlar", json=state, headers={"if-none-match": "*"}))
    data(
        student.post(
            "/api/v1/progress/events",
            json=[
                {
                    "client_event_id": "evt-ayse-0001",
                    "lesson_id": "python-ilk-adimlar",
                    "cell_id": "ilk-kod",
                    "kind": "cell-completed",
                    "occurred_at": "2026-10-16T10:00:00Z",
                }
            ],
        )
    )
    data(student.post("/api/v1/reports?lesson_id=geri-donusum-yapici", content=REPORT, headers=JSON))
    return teacher, room_id, student, cred


# --- access (export) --------------------------------------------------------------------


def test_export_contains_everything_about_me_and_no_secrets(class_with_student):
    _, _, student, cred = class_with_student
    doc = data(student.get("/api/v1/me/export"))
    assert doc["format_version"] == 1
    assert doc["account"]["username"] == cred["login"] and doc["account"]["created_by"]["role"] == "teacher"
    assert doc["notebooks"][0]["state"]["cells"]["ilk-kod"]["source"] == "print('benim kodum')"
    assert doc["progress_events"][0]["verification"] == "self_reported"
    assert doc["training_reports"][0]["report"]["project_id"] == "akilli-geri-donusum"
    assert doc["classroom_memberships"] == [{"classroom": "7-A", "status": "active", "since": doc["classroom_memberships"][0]["since"]}]
    assert {e["action"] for e in doc["access_log"]} >= {"student_account_created"}
    text = json.dumps(doc)
    assert "scrypt$" not in text and "password_hash" not in text and "token" not in text
    assert doc["not_included"]


def test_teacher_export_lists_classrooms_but_not_students_personal_data(class_with_student):
    teacher, *_ = class_with_student
    doc = data(teacher.get("/api/v1/me/export"))
    assert doc["owned_classrooms"][0]["member_count"] == 1
    assert "Ayşe" not in json.dumps(doc["owned_classrooms"])


def test_exporting_is_recorded_in_my_access_log(class_with_student):
    _, _, student, _ = class_with_student
    student.get("/api/v1/me/export")
    newest = data(student.get("/api/v1/me/access-log"))[0]
    assert newest["action"] == "data_exported" and newest["by_me"] is True


# --- rectification -----------------------------------------------------------------------


def test_profile_update_changes_only_sent_fields(client_factory):
    c = client_factory("student")
    assert data(c.patch("/api/v1/me", json={"age_band": "11-13"}))["age_band"] == "11-13"
    updated = data(c.patch("/api/v1/me", json={"display_name": "  Deniz   T. "}))
    assert updated["display_name"] == "Deniz T." and updated["age_band"] == "11-13"
    assert data(c.patch("/api/v1/me", json={"age_band": None}))["age_band"] is None
    error(c.patch("/api/v1/me", json={"age_band": "9-10"}), 422, "validation_error")


# --- access log (who looked at my data) -------------------------------------------------------


def test_student_sees_which_teacher_accessed_their_data(class_with_student):
    teacher, room_id, student, cred = class_with_student
    teacher.get(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}/progress")
    teacher.get(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}/reports")
    page = student.get("/api/v1/me/access-log?limit=2").json()
    actions = [e["action"] for e in page["data"]]
    assert actions == ["student_reports_viewed", "student_progress_viewed"]  # newest first
    assert all(e["by"] == "Demo öğretmen" and e["by_role"] == "teacher" and e["classroom_id"] == room_id for e in page["data"])
    rest = data(student.get(f"/api/v1/me/access-log?cursor={page['meta']['pagination']['next_cursor']}"))
    assert "student_account_created" in [e["action"] for e in rest]


def test_access_log_only_shows_my_own_events(class_with_student, client_factory):
    other = client_factory("student")
    assert data(other.get("/api/v1/me/access-log")) == []


# --- erasure ---------------------------------------------------------------------------------


def test_deleting_my_account_removes_all_my_data(app, class_with_student, engine):
    _, room_id, student, cred = class_with_student
    user_id = __import__("uuid").UUID(cred["user_id"])
    error(student.post("/api/v1/me/delete", json={"password": "yanlis", "confirm": True}), 401, "invalid_current_password")
    error(student.post("/api/v1/me/delete", json={"password": STRONG}), 422, "validation_error")  # confirm required
    assert data(student.post("/api/v1/me/delete", json={"password": STRONG, "confirm": True})) is None

    error(login(app, cred["login"], STRONG)[1], 401, "invalid_credentials")
    for model in (StudentNotebook, ProgressEvent, TrainingReport, AuthSession, ClassroomMembership):
        assert count(engine, model, user_id=user_id) == 0, model.__name__
    assert count(engine, User, id=user_id) == 0
    # Audit events survive but no longer point at the person.
    assert count(engine, AuditEvent, subject_id=user_id) == 0 and count(engine, AuditEvent, actor_id=user_id) == 0
    assert count(engine, AuditEvent, action="account_deleted") == 1
    assert count(engine, Classroom, id=room_id) == 1  # the class itself stays


def test_demo_account_can_be_deleted_without_a_password(client_factory):
    c = client_factory("student")
    assert data(c.post("/api/v1/me/delete", json={"confirm": True})) is None
    error(c.get("/api/v1/auth/me"), 401, "not_authenticated")


def test_deleting_a_teacher_removes_their_classrooms_but_keeps_student_accounts(app, class_with_student, engine):
    teacher, room_id, _, cred = class_with_student
    data(teacher.post("/api/v1/me/delete", json={"confirm": True}))  # demo teacher: no password
    assert count(engine, Classroom, id=room_id) == 0
    with Session(engine) as db:
        student = UserRepository(db).by_login(cred["login"])
        assert student is not None and student.created_by_id is None
    assert data(login(app, cred["login"], STRONG)[1])["user"]["role"] == "student"


def test_admins_cannot_delete_themselves_here(app, make_user):
    make_user("admin", email="admin@okul.example", password="yonetici-cok-uzun-sifre")
    admin, _ = login(app, "admin@okul.example", "yonetici-cok-uzun-sifre")
    error(admin.post("/api/v1/me/delete", json={"password": "yonetici-cok-uzun-sifre", "confirm": True}), 422, "admin_not_deletable")


# --- teacher deletes a student who left ---------------------------------------------------------


def test_teacher_deletes_a_student_account_they_created(app, class_with_student, client_factory, engine):
    teacher, room_id, _, cred = class_with_student
    other_teacher = client_factory("teacher")
    error(other_teacher.delete(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}"), 404, "classroom_not_found")
    assert data(teacher.delete(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}")) is None
    error(login(app, cred["login"], STRONG)[1], 401, "invalid_credentials")
    assert count(engine, AuditEvent, action="student_account_deleted") == 1


def test_teacher_cannot_delete_a_student_who_joined_with_a_code(client_factory):
    teacher = client_factory("teacher")
    room = data(teacher.post("/api/v1/classrooms", json={"name": "8-B"}))
    student = client_factory("student")
    student_id = data(student.get("/api/v1/auth/me"))["id"]
    student.post("/api/v1/classrooms/join", json={"code": room["join_code"]})
    teacher.post(f"/api/v1/classrooms/{room['id']}/members/{student_id}/approve")
    error(teacher.delete(f"/api/v1/classrooms/{room['id']}/students/{student_id}"), 403, "not_account_creator")


# --- retention --------------------------------------------------------------------------------


def maintenance(engine, clock, **settings):
    with Session(engine) as db:
        return MaintenanceService(
            SessionRepository(db), AttemptRepository(db), UserRepository(db), AuditRepository(db), Settings(**settings), clock, db
        ).cleanup()


def test_audit_events_are_kept_for_the_retention_period(class_with_student, clock, engine):
    before = count(engine, AuditEvent)
    assert before > 0
    clock.advance(days=364)
    assert maintenance(engine, clock).audit_events == 0
    clock.advance(days=2)
    assert maintenance(engine, clock).audit_events == before


def test_inactive_student_deletion_is_opt_in(app, class_with_student, clock, engine):
    _, _, _, cred = class_with_student
    clock.advance(days=400)
    assert maintenance(engine, clock).inactive_students == 0  # disabled by default
    assert maintenance(engine, clock, inactive_student_retention_days=365).inactive_students == 1
    error(login(app, cred["login"], STRONG)[1], 401, "invalid_credentials")
