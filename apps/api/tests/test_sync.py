"""Step 5: sync contract — notebook revisions (ETag/If-Match), idempotent events, deduplicated reports."""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.clock import SystemClock
from app.models import ProgressEvent, TrainingReport
from app.repositories.notebooks import NotebookRepository
from app.repositories.users import UserRepository

from .conftest import HEADERS, data, error, login

LESSON = "python-ilk-adimlar"
URL = f"/api/v1/notebooks/{LESSON}"
REPORT = (Path(__file__).resolve().parents[2] / "web/tests/fixtures/akilli-geri-donusum-colab-report.json").read_text(encoding="utf-8")
STRONG = "mavi-bisiklet-yaz-2026"


def snapshot(source: str) -> dict:
    return {"schema": 1, "lessonId": LESSON, "lessonVersion": 1, "cells": {"ilk-kod": {"source": source}}}


def two_devices(app, make_user):
    """The same student signed in on two devices (two independent cookie jars)."""
    make_user("student", username="ayse.1234", password=STRONG, name="Ayşe K.")
    laptop, _ = login(app, "ayse.1234", STRONG)
    tablet, _ = login(app, "ayse.1234", STRONG)
    return laptop, tablet


# --- notebooks: optimistic concurrency ---------------------------------------------------------


def test_first_save_creates_revision_1_with_an_etag(client_factory):
    c = client_factory()
    r = c.put(URL, json=snapshot("v1"), headers={"if-none-match": "*"})
    assert r.status_code == 201 and r.headers["etag"] == '"1"' and data(r)["revision"] == 1
    got = c.get(URL)
    assert got.headers["etag"] == '"1"' and data(got)["state"]["cells"]["ilk-kod"]["source"] == "v1"


def test_saves_without_a_precondition_are_refused(client_factory):
    c = client_factory()
    error(c.put(URL, json=snapshot("v1")), 428, "precondition_required")
    c.put(URL, json=snapshot("v1"), headers={"if-none-match": "*"})
    error(c.put(URL, json=snapshot("v2")), 428, "precondition_required")


def test_two_devices_cannot_overwrite_each_other(app, make_user):
    laptop, tablet = two_devices(app, make_user)
    laptop.put(URL, json=snapshot("ortak başlangıç"), headers={"if-none-match": "*"})
    # Both devices load revision 1 ...
    rev_laptop = laptop.get(URL).headers["etag"]
    rev_tablet = tablet.get(URL).headers["etag"]
    assert rev_laptop == rev_tablet == '"1"'
    # ... the laptop saves first ...
    saved = laptop.put(URL, json=snapshot("dizüstü değişikliği"), headers={"if-match": rev_laptop})
    assert data(saved)["revision"] == 2 and saved.headers["etag"] == '"2"'
    # ... and the tablet's save, based on revision 1, is refused instead of silently overwriting.
    conflict = error(tablet.put(URL, json=snapshot("tablet değişikliği"), headers={"if-match": rev_tablet}), 412, "notebook_revision_conflict")
    assert conflict["details"][0]["current_revision"] == 2
    assert data(tablet.get(URL))["state"]["cells"]["ilk-kod"]["source"] == "dizüstü değişikliği"
    # The tablet resolves (here: keeps its own version) and saves on top of revision 2.
    resolved = tablet.put(URL, json=snapshot("tablet değişikliği"), headers={"if-match": '"2"'})
    assert data(resolved)["revision"] == 3


def test_first_save_conflicts_if_another_device_already_created_it(app, make_user):
    laptop, tablet = two_devices(app, make_user)
    laptop.put(URL, json=snapshot("dizüstü"), headers={"if-none-match": "*"})
    conflict = error(tablet.put(URL, json=snapshot("tablet"), headers={"if-none-match": "*"}), 412, "notebook_revision_conflict")
    assert conflict["details"][0]["current_revision"] == 1


def test_if_match_formats(client_factory):
    c = client_factory()
    c.put(URL, json=snapshot("v1"), headers={"if-none-match": "*"})
    assert data(c.put(URL, json=snapshot("v2"), headers={"if-match": 'W/"1"'}))["revision"] == 2  # weak ETag accepted
    assert data(c.put(URL, json=snapshot("v3"), headers={"if-match": "2"}))["revision"] == 3  # bare number accepted
    error(c.put(URL, json=snapshot("v4"), headers={"if-match": "*"}), 422, "invalid_if_match")  # no blind overwrite
    error(c.put(URL, json=snapshot("v4"), headers={"if-match": "abc"}), 422, "invalid_if_match")
    error(c.put(URL, json=snapshot("v4"), headers={"if-none-match": '"3"'}), 422, "invalid_if_none_match")


def test_if_match_on_a_missing_notebook_says_so(client_factory):
    error(client_factory().put(URL, json=snapshot("v1"), headers={"if-match": '"1"'}), 404, "notebook_not_found")


def test_compare_and_set_is_atomic(app, make_user, engine):
    """Two writers with the same expected revision: exactly one wins, at the database level."""
    user_id = make_user("student", username="atomik.0001", password=STRONG)
    now = SystemClock().now()
    with Session(engine) as db:
        repo = NotebookRepository(db)
        assert repo.create(user_id, LESSON, 1, snapshot("v1"), now) is not None
        assert repo.create(user_id, LESSON, 1, snapshot("paralel"), now) is None  # parallel first save loses
        assert repo.update_if_revision(user_id, LESSON, 1, 1, snapshot("A"), now) is True
        assert repo.update_if_revision(user_id, LESSON, 1, 1, snapshot("B"), now) is False
        db.commit()
        assert repo.get(user_id, LESSON).state["cells"]["ilk-kod"]["source"] == "A"
        assert UserRepository(db).get(user_id) is not None


def test_notebook_list_gives_revisions_without_content(client_factory):
    c = client_factory()
    c.put(URL, json=snapshot("v1"), headers={"if-none-match": "*"})
    c.put(URL, json=snapshot("v2"), headers={"if-match": '"1"'})
    summaries = data(c.get("/api/v1/notebooks"))
    assert summaries == [{"lesson_id": LESSON, "lesson_version": 1, "revision": 2, "updated_at": summaries[0]["updated_at"]}]


# --- progress events: idempotent ingestion ------------------------------------------------------------


def event(client_event_id: str, cell: str = "ilk-kod") -> dict:
    return {"client_event_id": client_event_id, "lesson_id": LESSON, "cell_id": cell, "kind": "cell-completed", "occurred_at": "2026-10-16T10:00:00Z"}


def test_retried_event_batches_are_not_duplicated(client_factory, engine):
    c = client_factory()
    batch = [event("evt-0000-0001"), event("evt-0000-0002", "dongu")]
    assert data(c.post("/api/v1/progress/events", json=batch)) == {"stored": 2, "duplicates": 0}
    assert data(c.post("/api/v1/progress/events", json=batch)) == {"stored": 0, "duplicates": 2}  # network retry
    mixed = [event("evt-0000-0002"), event("evt-0000-0003"), event("evt-0000-0003")]  # old + new + repeated within batch
    assert data(c.post("/api/v1/progress/events", json=mixed)) == {"stored": 1, "duplicates": 2}
    assert len(data(c.get("/api/v1/progress/events"))) == 3


def test_client_event_ids_are_scoped_per_user(client_factory):
    a, b = client_factory(), client_factory()
    assert data(a.post("/api/v1/progress/events", json=[event("ayni-kimlik-01")]))["stored"] == 1
    assert data(b.post("/api/v1/progress/events", json=[event("ayni-kimlik-01")]))["stored"] == 1


def test_events_require_a_well_formed_client_event_id(client_factory):
    c = client_factory()
    missing = {k: v for k, v in event("x" * 10).items() if k != "client_event_id"}
    assert "body.0.client_event_id" in {
        d["field"] for d in error(c.post("/api/v1/progress/events", json=[missing]), 422, "validation_error")["details"]
    }
    error(c.post("/api/v1/progress/events", json=[event("kısa")]), 422, "validation_error")
    error(c.post("/api/v1/progress/events", json=[event("boşluk var 123")]), 422, "validation_error")


# --- reports: deduplicated uploads -------------------------------------------------------------------------


def test_uploading_the_same_report_twice_stores_it_once(client_factory, engine):
    c = client_factory()
    url = "/api/v1/reports?lesson_id=geri-donusum-yapici"
    first = c.post(url, content=REPORT, headers={"content-type": "application/json"})
    # Same content, different formatting/key order: still the same report.
    reformatted = json.dumps(json.loads(REPORT), indent=4, sort_keys=True)
    again = c.post(url, content=reformatted, headers={"content-type": "application/json"})
    assert first.status_code == 201 and again.status_code == 200
    assert data(first)["id"] == data(again)["id"]
    changed = json.loads(REPORT)
    changed["environment"]["runtime_seconds"] += 1
    assert c.post(url, content=json.dumps(changed), headers={"content-type": "application/json"}).status_code == 201
    with Session(engine) as db:
        assert db.query(TrainingReport).count() == 2 and db.query(ProgressEvent).count() == 0


# --- browser access ------------------------------------------------------------------------------------------


def test_cors_lets_the_web_app_use_if_match_and_read_etag(client_factory):
    c = client_factory(None)
    pre = c.options(
        URL,
        headers={
            "origin": "http://localhost:3000",
            "access-control-request-method": "PUT",
            "access-control-request-headers": "if-match,x-atolye-client,content-type",
        },
    )
    assert pre.status_code == 200 and "if-match" in pre.headers["access-control-allow-headers"].lower()
    actual = c.get("/api/v1/health/live", headers={"origin": "http://localhost:3000"})
    assert "etag" in actual.headers["access-control-expose-headers"].lower()


_ = HEADERS
