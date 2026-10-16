"""Teacher panel endpoints: class overview and student reflections (both audited, both scoped to own classrooms)."""

import json
from pathlib import Path

from .conftest import data, error, login

REPORT = (Path(__file__).resolve().parents[2] / "web/tests/fixtures/akilli-geri-donusum-colab-report.json").read_text(encoding="utf-8")
STRONG = "mavi-bisiklet-yaz-2026"


def setup_class(app, client_factory):
    teacher = client_factory("teacher")
    room_id = data(teacher.post("/api/v1/classrooms", json={"name": "7-A"}))["id"]
    cred = data(teacher.post(f"/api/v1/classrooms/{room_id}/students", json={"display_name": "Ayşe K."}))
    student, _ = login(app, cred["login"], cred["one_time_password"])
    data(student.post("/api/v1/auth/password", json={"current_password": cred["one_time_password"], "new_password": STRONG}))
    return teacher, room_id, student, cred


def test_overview_summarizes_each_member(app, client_factory):
    teacher, room_id, student, cred = setup_class(app, client_factory)
    events = [
        {"client_event_id": f"evt-ozet-000{i}", "lesson_id": "python-ilk-adimlar", "cell_id": c, "kind": k, "occurred_at": f"2026-10-16T10:0{i}:00Z"}
        for i, (c, k) in enumerate([("ortalama-gorevi", "challenge-passed"), ("hatayi-bul", "challenge-passed"), ("dusun", "lesson-completed")])
    ]
    data(student.post("/api/v1/progress/events", json=events))
    data(student.post("/api/v1/reports?lesson_id=geri-donusum-yapici", content=REPORT, headers={"content-type": "application/json"}))
    # A pending join request shows up without any learning data.
    joiner = client_factory("student")
    joiner.post("/api/v1/classrooms/join", json={"code": data(teacher.get("/api/v1/classrooms"))[0]["join_code"]})

    rows = {r["display_name"]: r for r in data(teacher.get(f"/api/v1/classrooms/{room_id}/overview"))}
    ayse = rows["Ayşe K."]
    assert ayse["status"] == "active" and ayse["username"] == cred["login"]
    assert ayse["completed_lessons"] == ["python-ilk-adimlar"] and ayse["challenges_passed"] == 2
    assert ayse["reports"] == 1 and ayse["latest_test_accuracy"] == json.loads(REPORT)["test_metrics"]["accuracy"]
    assert ayse["last_activity_at"].startswith("2026-10-16T10:02")
    pending = rows["Demo öğrenci"]
    assert pending["status"] == "pending" and pending["completed_lessons"] == [] and pending["reports"] == 0

    log = [e["action"] for e in data(student.get("/api/v1/me/access-log"))]
    assert "class_overview_viewed" in log


def test_teacher_reads_submitted_reflections_only(app, client_factory):
    teacher, room_id, student, cred = setup_class(app, client_factory)
    state = {
        "schema": 1,
        "lessonId": "python-ilk-adimlar",
        "lessonVersion": 1,
        "cells": {
            "dusun": {
                "kind": "reflection",
                "text": "taslak",
                "submittedText": "Model veriden öğrenir, kural yazmaya gerek kalmaz.",
                "submittedAt": "2026-10-16T11:00:00Z",
            },
            "taslak": {"kind": "reflection", "text": "henüz gönderilmedi", "submittedText": None, "submittedAt": None},
            "ilk-kod": {"kind": "code", "source": "print(1)"},
        },
    }
    data(student.put("/api/v1/notebooks/python-ilk-adimlar", json=state, headers={"if-none-match": "*"}))
    reflections = data(teacher.get(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}/reflections"))
    assert reflections == [
        {
            "lesson_id": "python-ilk-adimlar",
            "cell_id": "dusun",
            "text": "Model veriden öğrenir, kural yazmaya gerek kalmaz.",
            "submitted_at": "2026-10-16T11:00:00Z",
        }
    ]
    assert data(student.get("/api/v1/me/access-log"))[0]["action"] == "student_reflections_viewed"


def test_review_endpoints_are_scoped_to_own_classrooms(app, client_factory):
    _, room_id, student, cred = setup_class(app, client_factory)
    other = client_factory("teacher")
    error(other.get(f"/api/v1/classrooms/{room_id}/overview"), 404, "classroom_not_found")
    error(other.get(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}/reflections"), 404, "classroom_not_found")
    error(student.get(f"/api/v1/classrooms/{room_id}/overview"), 403, "forbidden")
