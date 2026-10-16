"""Step 3: teacher-provisioned student accounts, first-login password change, resets, rate limiting, cleanup."""

import re

import pytest
from sqlalchemy.orm import Session

from app.core.clock import SystemClock
from app.core.config import Settings
from app.domain.errors import InvalidInput
from app.domain.passwords import policy_for
from app.domain.usernames import username_base
from app.models import Role
from app.repositories.attempts import AttemptRepository
from app.repositories.audit import AuditRepository
from app.repositories.sessions import SessionRepository
from app.repositories.users import UserRepository
from app.security.hashing import ScryptHasher
from app.services.maintenance import MaintenanceService

from .conftest import data, error, login

STRONG = "mavi-bisiklet-yaz-2026"


@pytest.fixture
def classroom(client_factory):
    teacher = client_factory("teacher")
    room = data(teacher.post("/api/v1/classrooms", json={"name": "7-A Yapay Zekâ"}))
    return teacher, room["id"]


def create_student(teacher, room_id, name="Ayşe K."):
    return data(teacher.post(f"/api/v1/classrooms/{room_id}/students", json={"display_name": name}))


# --- provisioning ---------------------------------------------------------------------


def test_teacher_creates_a_student_who_must_change_the_one_time_password(app, classroom):
    teacher, room_id = classroom
    cred = create_student(teacher, room_id, "Ayşe K.")
    assert re.fullmatch(r"ayse\.\d{4}", cred["login"])
    assert re.fullmatch(r"[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}", cred["one_time_password"])

    student, r = login(app, cred["login"], cred["one_time_password"])
    assert data(r)["user"]["must_change_password"] is True
    # Until the password is changed, only /auth/me, /auth/password and logout work.
    assert data(student.get("/api/v1/auth/me"))["username"] == cred["login"]
    error(student.get("/api/v1/classrooms"), 403, "password_change_required")
    error(student.get("/api/v1/progress/events"), 403, "password_change_required")

    changed = data(student.post("/api/v1/auth/password", json={"current_password": cred["one_time_password"], "new_password": STRONG}))
    assert changed["user"]["must_change_password"] is False
    rooms = data(student.get("/api/v1/classrooms"))
    assert [r["id"] for r in rooms] == [room_id]  # created students are already approved members

    # The one-time password no longer works; the new one does.
    error(login(app, cred["login"], cred["one_time_password"])[1], 401, "invalid_credentials")
    assert data(login(app, cred["login"], STRONG)[1])["user"]["display_name"] == "Ayşe K."


def test_the_one_time_password_is_not_stored_in_clear_text(classroom, engine):
    teacher, room_id = classroom
    cred = create_student(teacher, room_id)
    with Session(engine) as db:
        user = UserRepository(db).by_login(cred["login"])
        assert cred["one_time_password"] not in (user.password_hash or "")
        assert user.created_by_id is not None and user.email is None


def test_bulk_create_and_limits(classroom):
    teacher, room_id = classroom
    created = data(
        teacher.post(f"/api/v1/classrooms/{room_id}/students/bulk", json={"students": [{"display_name": n} for n in ("Ali", "Zeynep", "Çağrı")]})
    )
    assert len(created) == 3 and len({c["login"] for c in created}) == 3
    assert created[2]["login"].startswith("cagri.")
    members = data(teacher.get(f"/api/v1/classrooms/{room_id}/members"))
    assert {m["status"] for m in members} == {"active"} and len(members) == 3
    too_many = {"students": [{"display_name": f"Ö{i}"} for i in range(41)]}
    error(teacher.post(f"/api/v1/classrooms/{room_id}/students/bulk", json=too_many), 422, "validation_error")
    error(teacher.post(f"/api/v1/classrooms/{room_id}/students", json={"display_name": "   "}), 422, "validation_error")


def test_only_the_owner_teacher_can_create_or_reset_students(client_factory, classroom):
    teacher, room_id = classroom
    other_teacher, student = client_factory("teacher"), client_factory("student")
    error(other_teacher.post(f"/api/v1/classrooms/{room_id}/students", json={"display_name": "X"}), 404, "classroom_not_found")
    error(student.post(f"/api/v1/classrooms/{room_id}/students", json={"display_name": "X"}), 403, "forbidden")
    cred = create_student(teacher, room_id)
    error(other_teacher.post(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}/reset-password"), 404, "classroom_not_found")


def test_teacher_resets_a_forgotten_password_and_signs_the_student_out(app, classroom):
    teacher, room_id = classroom
    cred = create_student(teacher, room_id)
    student, _ = login(app, cred["login"], cred["one_time_password"])
    student.post("/api/v1/auth/password", json={"current_password": cred["one_time_password"], "new_password": STRONG})
    assert student.get("/api/v1/classrooms").status_code == 200

    reset = data(teacher.post(f"/api/v1/classrooms/{room_id}/students/{cred['user_id']}/reset-password"))
    assert reset["login"] == cred["login"] and reset["one_time_password"] != cred["one_time_password"]
    error(student.get("/api/v1/auth/me"), 401, "session_expired")  # signed out everywhere
    error(login(app, cred["login"], STRONG)[1], 401, "invalid_credentials")
    assert data(login(app, cred["login"], reset["one_time_password"])[1])["user"]["must_change_password"] is True


def test_reset_is_only_for_teacher_created_members(client_factory, classroom):
    teacher, room_id = classroom
    demo_student = client_factory("student")
    demo_id = data(demo_student.get("/api/v1/auth/me"))["id"]
    error(teacher.post(f"/api/v1/classrooms/{room_id}/students/{demo_id}/reset-password"), 404, "student_not_in_classroom")


def test_admin_creates_teacher_accounts(app, make_user, client_factory):
    make_user("admin", email="admin@okul.example", password="yonetici-cok-uzun-sifre")
    admin, _ = login(app, "admin@okul.example", "yonetici-cok-uzun-sifre")
    cred = data(admin.post("/api/v1/admin/teachers", json={"email": "Yeni.Ogretmen@okul.example", "display_name": "Elif Öğretmen"}))
    assert cred["login"] == "yeni.ogretmen@okul.example"
    error(admin.post("/api/v1/admin/teachers", json={"email": "yeni.ogretmen@okul.example", "display_name": "Tekrar"}), 409, "email_taken")
    error(client_factory("teacher").post("/api/v1/admin/teachers", json={"email": "x@y.z", "display_name": "X"}), 403, "forbidden")
    teacher, r = login(app, cred["login"], cred["one_time_password"])
    assert data(r)["user"]["role"] == "teacher" and data(r)["user"]["must_change_password"] is True
    # Staff passwords need at least 12 characters.
    weak = teacher.post("/api/v1/auth/password", json={"current_password": cred["one_time_password"], "new_password": "kisa-sifre"})
    assert "12" in error(weak, 422, "weak_password")["details"][0]["message"]


# --- password change --------------------------------------------------------------------


def test_password_change_rules(app, classroom):
    teacher, room_id = classroom
    cred = create_student(teacher, room_id, "Mehmet Y.")
    student, _ = login(app, cred["login"], cred["one_time_password"])
    otp = cred["one_time_password"]
    post = lambda current, new: student.post("/api/v1/auth/password", json={"current_password": current, "new_password": new})  # noqa: E731

    error(post("yanlis-sifre", STRONG), 401, "invalid_current_password")
    error(post(otp, otp), 422, "password_unchanged")
    for weak in ("kisa", "12345678", "galatasaray", "aaaaaaaaaa", f"{cred['login']}-uzun", "mehmet-cok-uzun-sifre"):
        details = error(post(otp, weak), 422, "weak_password")["details"]
        assert details and all(d["field"] == "new_password" for d in details)
    assert data(post(otp, STRONG))["user"]["must_change_password"] is False


def test_password_change_ends_all_other_sessions(app, make_user):
    make_user("teacher", email="t@okul.example", password="ilk-uzun-sifre-1234")
    laptop, _ = login(app, "t@okul.example", "ilk-uzun-sifre-1234")
    phone, _ = login(app, "t@okul.example", "ilk-uzun-sifre-1234")
    data(laptop.post("/api/v1/auth/password", json={"current_password": "ilk-uzun-sifre-1234", "new_password": "ikinci-uzun-sifre-5678"}))
    assert data(laptop.get("/api/v1/auth/me"))["role"] == "teacher"  # this device got a fresh session
    error(phone.get("/api/v1/auth/me"), 401, "session_expired")


def test_demo_accounts_have_no_password_to_change(client_factory):
    c = client_factory("student")
    error(c.post("/api/v1/auth/password", json={"current_password": "x", "new_password": STRONG}), 403, "demo_account")


def test_logout_all_devices(app, make_user):
    make_user("teacher", email="t2@okul.example", password="ilk-uzun-sifre-1234")
    a, _ = login(app, "t2@okul.example", "ilk-uzun-sifre-1234")
    b, _ = login(app, "t2@okul.example", "ilk-uzun-sifre-1234")
    assert data(a.post("/api/v1/auth/logout-all"))["sessions_ended"] == 2
    error(b.get("/api/v1/auth/me"), 401, "session_expired")


def test_sessions_expire(app, make_user, clock):
    make_user("teacher", email="t3@okul.example", password="ilk-uzun-sifre-1234")
    c, _ = login(app, "t3@okul.example", "ilk-uzun-sifre-1234")
    assert c.get("/api/v1/auth/me").status_code == 200
    clock.advance(hours=13)
    error(c.get("/api/v1/auth/me"), 401, "session_expired")


# --- brute-force protection ---------------------------------------------------------------


def test_account_is_throttled_after_repeated_failures_then_recovers(app, make_user, clock):
    make_user("teacher", email="hedef@okul.example", password="dogru-uzun-sifre-42")
    for _ in range(5):
        error(login(app, "hedef@okul.example", "yanlis")[1], 401, "invalid_credentials")
    _, blocked = login(app, "hedef@okul.example", "dogru-uzun-sifre-42")  # even the right password waits
    error(blocked, 429, "too_many_login_attempts")
    assert 0 < int(blocked.headers["retry-after"]) <= 15 * 60 + 1
    clock.advance(minutes=16)
    assert data(login(app, "hedef@okul.example", "dogru-uzun-sifre-42")[1])["user"]["role"] == "teacher"


def test_a_successful_login_resets_the_account_counter(app, make_user, clock):
    make_user("teacher", email="sifirla@okul.example", password="dogru-uzun-sifre-42")
    for _ in range(4):
        login(app, "sifirla@okul.example", "yanlis")
    assert login(app, "sifirla@okul.example", "dogru-uzun-sifre-42")[1].status_code == 200
    for _ in range(4):
        error(login(app, "sifirla@okul.example", "yanlis")[1], 401, "invalid_credentials")


def test_unknown_accounts_look_like_wrong_passwords_and_are_throttled_per_ip(app, settings_override, clock):
    settings_override(login_max_failures_per_ip=3)
    for name in ("yok1", "yok2", "yok3"):
        error(login(app, name, "deneme")[1], 401, "invalid_credentials")
    error(login(app, "yok4", "deneme")[1], 429, "too_many_login_attempts")


def test_demo_account_creation_is_rate_limited(client_factory, settings_override, clock):
    settings_override(demo_max_per_ip_per_hour=2)
    client_factory("student")
    client_factory("student")
    error(client_factory(None).post("/api/v1/auth/demo", json={"role": "student"}), 429, "too_many_demo_accounts")
    clock.advance(hours=1, minutes=1)
    assert client_factory(None).post("/api/v1/auth/demo", json={"role": "student"}).status_code == 201


def test_attempts_store_only_keyed_hashes(app, make_user, engine):
    make_user("teacher", email="gizli@okul.example", password="dogru-uzun-sifre-42")
    login(app, "gizli@okul.example", "yanlis")
    with Session(engine) as db:
        from app.models import AuthAttempt

        row = db.query(AuthAttempt).one()
    assert "gizli" not in row.key_hash and "testclient" not in row.ip_hash and len(row.key_hash) == 64


# --- maintenance ---------------------------------------------------------------------------


def test_cleanup_removes_stale_sessions_old_attempts_and_old_demo_users(app, client_factory, make_user, clock, engine):
    client_factory("student")  # demo user + session "now"
    make_user("teacher", email="kalici@okul.example", password="dogru-uzun-sifre-42")
    login(app, "kalici@okul.example", "yanlis")  # one attempt row
    clock.advance(days=8)
    with Session(engine) as db:
        result = MaintenanceService(
            SessionRepository(db), AttemptRepository(db), UserRepository(db), AuditRepository(db), Settings(), clock, db
        ).cleanup()
        remaining_users = [u.email for u in db.query(__import__("app.models", fromlist=["User"]).User).all()]
    assert result.sessions >= 1 and result.attempts == 2 and result.demo_users == 1  # attempts: one demo + one login
    assert remaining_users == ["kalici@okul.example"]
    _ = SystemClock


# --- domain units ----------------------------------------------------------------------------


def test_password_policy_units():
    student, staff = policy_for(Role.student), policy_for(Role.teacher)
    assert student.problems("mavi-kalem") == []  # 10 characters: fine for students
    assert staff.problems("mavi-kalem") != []  # staff need 12+
    assert staff.problems("mavi-bisiklet-yaz") == []
    assert student.problems("1111111111")
    assert student.problems("ayse-cok-gizli", context=["Ayşe K."])  # accent-insensitive
    assert student.problems("AYSE-cok-gizli", context=["ayse.4821"])  # username without its number
    assert student.problems("gizli-cagri-99", context=["Çağrı"])
    assert student.problems("kedi-çağrı-99") == []  # no context: fine
    assert student.problems("FENERBAHÇE")  # common, with accents and capitals
    with pytest.raises(InvalidInput):
        student.check("Fenerbahce")


def test_username_base_handles_turkish_names():
    assert username_base("Çağrı Öztürk") == "cagri"
    assert username_base("İlayda") == "ilayda"
    assert username_base("  ") == "ogrenci"
    assert username_base("Ş") == "ogrenci"


def test_hasher_accepts_legacy_hashes_and_rejects_unknown_users():
    import hashlib

    hasher = ScryptHasher()
    salt = bytes.fromhex("00" * 16)
    legacy = f"scrypt${salt.hex()}${hashlib.scrypt(b'eski-sifre', salt=salt, n=2**14, r=8, p=1, dklen=32).hex()}"
    assert hasher.verify("eski-sifre", legacy)
    assert not hasher.verify("eski-sifre", None)
    assert not hasher.verify("x", "bozuk$format")
