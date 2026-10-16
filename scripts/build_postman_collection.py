"""Build the Postman collection and environment in docs/postman/.

    python3 scripts/build_postman_collection.py

The student uses {{baseUrl}} (localhost) and the teacher uses {{teacherUrl}}
(127.0.0.1). Postman keeps cookies per host, so the two demo sessions stay
separate in one collection run.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "postman"
REPORT = json.loads((ROOT / "apps/web/tests/fixtures/akilli-geri-donusum-colab-report.json").read_text(encoding="utf-8"))

CSRF = {"key": "x-atolye-client", "value": "1"}
JSON_CT = {"key": "Content-Type", "value": "application/json"}


def req(name: str, method: str, url: str, *, body=None, headers=None, tests: list[str] | None = None, description: str = "", query=None):
    hdrs = list(headers if headers is not None else ([CSRF] if method in ("POST", "PUT", "PATCH", "DELETE") else []))
    item: dict = {"name": name, "request": {"method": method, "header": hdrs, "url": url, "description": description}}
    if body is not None:
        hdrs.append(JSON_CT)
        item["request"]["body"] = {"mode": "raw", "raw": json.dumps(body, ensure_ascii=False, indent=2), "options": {"raw": {"language": "json"}}}
    if tests:
        item["event"] = [{"listen": "test", "script": {"type": "text/javascript", "exec": tests}}]
    return item


def status(code: int) -> str:
    return f'pm.test("HTTP {code}", () => pm.response.to.have.status({code}));'


S, T = "{{baseUrl}}", "{{teacherUrl}}"

EVENTS = [
    {"client_event_id": "pm-olay-0001", "lesson_id": "python-ilk-adimlar", "cell_id": "ilk-kod", "kind": "cell-completed", "detail": "Kodu hatasız çalıştırdı", "occurred_at": "2026-10-16T10:00:00Z"},
    {"client_event_id": "pm-olay-0002", "lesson_id": "geri-donusum-yapici", "cell_id": "egit", "kind": "model-trained", "detail": "KNN test %97,5", "occurred_at": "2026-10-16T10:05:00Z"},
]

notebook = {
    "schema": 1,
    "lessonId": "python-ilk-adimlar",
    "lessonVersion": 1,
    "savedAt": "2026-10-16T10:00:00Z",
    "cells": {"ilk-kod": {"kind": "code", "source": "print('Postman’den merhaba')"}},
    "completions": {},
    "hintLevels": {},
    "evidence": [],
}
bad_report = json.loads(json.dumps(REPORT))
bad_report["test_metrics"]["accuracy"] = 0.999

def ok(path_js: str, expected: str, label: str) -> str:
    return f'pm.test("{label}", () => pm.expect(pm.response.json().data{path_js}).to.eql({expected}));'


ENVELOPE = 'pm.test("başarılı zarf", () => { const b = pm.response.json(); pm.expect(b.success).to.eql(true); pm.expect(b.meta.request_id).to.be.a("string"); });'


def err(code: str) -> str:
    return f'pm.test("hata kodu {code}", () => {{ const b = pm.response.json(); pm.expect(b.success).to.eql(false); pm.expect(b.error.code).to.eql("{code}"); }});'


folders = [
    {
        "name": "1 · Sistem",
        "item": [
            req("Canlılık (live)", "GET", f"{S}/health/live", tests=[status(200), ENVELOPE, ok(".status", '"ok"', "durum ok")],
                description="Süreç ayakta mı? Veritabanına dokunmaz."),
            req("Hazır olma (ready)", "GET", f"{S}/health/ready", tests=[status(200), ok(".status", '"ready"', "veritabanı ve migration hazır")],
                description="Veritabanı cevap veriyor mu ve şema en son migration'da mı? Değilse 503 döner."),
            req("Hata formatı ve istek kimliği", "GET", f"{S}/auth/me", headers=[{"key": "x-request-id", "value": "postman-ornek-istek-1"}],
                tests=[
                    "pm.response.to.have.status(401);",
                    # Postman keeps cookies between runs: an old (revoked/expired) session cookie gives
                    # session_expired, no cookie gives not_authenticated. Both are correct 401s.
                    'pm.test("hata zarfı: oturum yok ya da süresi dolmuş", () => { const b = pm.response.json(); pm.expect(b.success).to.eql(false); '
                    'pm.expect(b.error.code).to.be.oneOf(["not_authenticated", "session_expired"]); });',
                    'pm.test("istek kimliği geri döner", () => pm.expect(pm.response.headers.get("x-request-id")).to.eql("postman-ornek-istek-1"));',
                    'pm.test("güvenlik başlıkları", () => pm.expect(pm.response.headers.get("x-content-type-options")).to.eql("nosniff"));',
                ],
                description="Oturum açmadan önce gönderilir: 401 ve standart hata zarfı {success: false, error: {code, message, request_id}}. Postman önceki çalıştırmalardan kalan çerezi gönderirse kod session_expired olur; bu da doğrudur."),
        ],
    },
    {
        "name": "2 · Öğrenci (demo)",
        "item": [
            req("Demo öğrenci oturumu aç", "POST", f"{S}/auth/demo", body={"role": "student"},
                tests=[status(201), ENVELOPE, 'pm.collectionVariables.set("studentId", pm.response.json().data.user.id);'],
                description="Yalnızca ATOLYE_DEMO_MODE=true iken çalışır. Oturum httpOnly çerezde tutulur."),
            req("Ben kimim?", "GET", f"{S}/auth/me", tests=[status(200), ok(".role", '"student"', "öğrenci")]),
            req("CSRF koruması: başlıksız istek reddedilir", "POST", f"{S}/auth/demo", body={"role": "student"}, headers=[],
                tests=[status(403), err("csrf_rejected")], description="x-atolye-client başlığı olmadan durum değiştiren istekler 403 alır."),
            req("Defteri ilk kez kaydet (If-None-Match: *)", "PUT", f"{S}/notebooks/python-ilk-adimlar", body=notebook,
                headers=[CSRF, {"key": "If-None-Match", "value": "*"}],
                tests=[status(201), ENVELOPE, 'pm.collectionVariables.set("notebookEtag", pm.response.headers.get("ETag"));', ok(".revision", "1", "sürüm 1")],
                description="İlk kayıt If-None-Match: * ile yapılır. Yanıttaki ETag başlığı bir sonraki kayıtta If-Match olarak gönderilir."),
            req("Sürüm başlığı olmadan kayıt reddedilir", "PUT", f"{S}/notebooks/python-ilk-adimlar", body=notebook,
                tests=[status(428), err("precondition_required")], description="Hiçbir cihaz başka bir cihazın kaydının üzerine yanlışlıkla yazamasın diye."),
            req("Defteri güncelle (If-Match)", "PUT", f"{S}/notebooks/python-ilk-adimlar", body=notebook,
                headers=[CSRF, {"key": "If-Match", "value": "{{notebookEtag}}"}],
                tests=[status(200), ok(".revision", "2", "sürüm 2"), 'pm.collectionVariables.set("notebookEtag", pm.response.headers.get("ETag"));']),
            req("Eski sürüme dayalı kayıt çakışır (412)", "PUT", f"{S}/notebooks/python-ilk-adimlar", body=notebook,
                headers=[CSRF, {"key": "If-Match", "value": '"1"'}],
                tests=[status(412), err("notebook_revision_conflict"), 'pm.test("güncel sürüm bildirilir", () => pm.expect(pm.response.json().error.details[0].current_revision).to.eql(2));'],
                description="Başka bir cihaz arada kaydetmiş gibi: sunucu kaydın üzerine yazmaz, güncel sürümü bildirir."),
            req("Defteri getir", "GET", f"{S}/notebooks/python-ilk-adimlar",
                tests=[status(200), 'pm.test("kod geri geldi", () => pm.expect(pm.response.json().data.state.cells["ilk-kod"].source).to.include("Postman"));',
                       'pm.test("ETag başlığı", () => pm.expect(pm.response.headers.get("ETag")).to.eql(\'"2"\'));']),
            req("Defterlerim (sürümler)", "GET", f"{S}/notebooks", tests=[status(200), 'pm.test("1 defter, sürüm 2", () => pm.expect(pm.response.json().data[0].revision).to.eql(2));'],
                description="Uygulama açılışında hangi defterlerin değiştiğini anlamak için: içerik yok, yalnızca sürümler."),
            req("İlerleme olayları gönder", "POST", f"{S}/progress/events",
                body=EVENTS, tests=[status(201), ok(".stored", "2", "2 olay kaydedildi")],
                description="Her olay istemcinin ürettiği bir client_event_id taşır."),
            req("Aynı olayları tekrar gönder (bağlantı koptu)", "POST", f"{S}/progress/events", body=EVENTS,
                tests=[status(201), ok(".stored", "0", "yeni kayıt yok"), ok(".duplicates", "2", "2 tekrar yok sayıldı")],
                description="Aynı client_event_id ile gelen olaylar ikinci kez kaydedilmez; istemci gönül rahatlığıyla tekrar deneyebilir."),
            req("İlerleme olaylarını listele (sayfalı)", "GET", f"{S}/progress/events?limit=1",
                tests=[status(200), 'pm.test("sonraki sayfa imleci meta içinde", () => pm.expect(pm.response.json().meta.pagination.next_cursor).to.not.be.null);']),
            req("Colab raporu yükle (gerçek rapor)", "POST", f"{S}/reports?lesson_id=geri-donusum-yapici", body=REPORT,
                tests=[status(201), ok(".verification", '"self_reported"', "öz bildirim")],
                description="Bu rapor, Colab defteri gerçekten çalıştırılarak üretildi (scripts/verify_colab_notebook.py)."),
            req("Aynı raporu tekrar yükle", "POST", f"{S}/reports?lesson_id=geri-donusum-yapici", body=REPORT,
                tests=[status(200), ok(".verification", '"self_reported"', "kayıtlı rapor döner")], description="Aynı içerik ikinci kez kaydedilmez: 200 ile mevcut rapor döner."),
            req("Tutarsız rapor reddedilir", "POST", f"{S}/reports?lesson_id=geri-donusum-yapici", body=bad_report,
                tests=[status(422), err("report_invalid")], description="Doğruluk, karışıklık matrisiyle uyuşmadığı için reddedilir. Ayrıntılar error.details içinde."),
            req("Raporlarım", "GET", f"{S}/reports", tests=[status(200), 'pm.test("1 rapor", () => pm.expect(pm.response.json().data.length).to.eql(1));']),
        ],
    },
    {
        "name": "3 · Öğretmen ve sınıf",
        "description": "Öğretmen {{teacherUrl}} (127.0.0.1) üzerinden çalışır; çerezleri öğrencininkinden ayrı tutulur.",
        "item": [
            req("Demo öğretmen oturumu aç", "POST", f"{T}/auth/demo", body={"role": "teacher"}, tests=[status(201)]),
            req("Sınıf oluştur", "POST", f"{T}/classrooms", body={"name": "7-A Yapay Zekâ"},
                tests=[status(201), 'const d = pm.response.json().data; pm.collectionVariables.set("classroomId", d.id); pm.collectionVariables.set("joinCode", d.join_code);']),
            req("(Öğrenci) Sınıf koduyla katıl", "POST", f"{S}/classrooms/join", body={"code": "{{joinCode}}"},
                tests=[status(202), ok(".status", '"pending"', "onay bekliyor")]),
            req("(Öğrenci) Onaysızken ödevleri göremez", "GET", f"{S}/classrooms/{{{{classroomId}}}}/assignments", tests=[status(404), err("classroom_not_found")]),
            req("Üyeleri listele", "GET", f"{T}/classrooms/{{{{classroomId}}}}/members", tests=[status(200)]),
            req("Öğrenciyi onayla", "POST", f"{T}/classrooms/{{{{classroomId}}}}/members/{{{{studentId}}}}/approve",
                tests=[status(200), ok(".status", '"active"', "aktif")]),
            req("Ödev ver", "POST", f"{T}/classrooms/{{{{classroomId}}}}/assignments", body={"lesson_id": "geri-donusum-yapici"}, tests=[status(201)]),
            req("(Öğrenci) Ödevlerim", "GET", f"{S}/classrooms/{{{{classroomId}}}}/assignments", tests=[status(200)]),
            req("Öğrencinin ilerlemesi", "GET", f"{T}/classrooms/{{{{classroomId}}}}/students/{{{{studentId}}}}/progress", tests=[status(200)]),
            req("Öğrencinin Colab raporları", "GET", f"{T}/classrooms/{{{{classroomId}}}}/students/{{{{studentId}}}}/reports",
                tests=[status(200), 'pm.test("1 rapor", () => pm.expect(pm.response.json().data.length).to.eql(1));']),
            req("(Öğrenci) Demo öğrenci çıkış yapar", "POST", f"{S}/auth/logout", tests=[status(200), ok(".sessions_ended", "1", "1 oturum kapandı")]),
        ],
    },
    {
        "name": "4 · Öğretmen öğrenci hesabı açar",
        "description": "Gerçek kullanımın akışı: e-posta yok; öğretmen kullanıcı adı + tek seferlik şifre verir, öğrenci ilk girişte şifresini değiştirir.",
        "item": [
            req("Öğrenci hesabı oluştur", "POST", f"{T}/classrooms/{{{{classroomId}}}}/students", body={"display_name": "Ayşe K."},
                tests=[status(201), 'const d = pm.response.json().data; pm.collectionVariables.set("newLogin", d.login); pm.collectionVariables.set("oneTimePassword", d.one_time_password); pm.collectionVariables.set("newStudentId", d.user_id);'],
                description="Kullanıcı adı ve tek seferlik şifre yalnızca bu yanıtta görünür; veritabanında düz metin olarak saklanmaz."),
            req("Toplu öğrenci hesabı oluştur", "POST", f"{T}/classrooms/{{{{classroomId}}}}/students/bulk",
                body={"students": [{"display_name": "Ali Y."}, {"display_name": "Çağrı D."}]},
                tests=[status(201), 'pm.test("2 hesap", () => pm.expect(pm.response.json().data.length).to.eql(2));', 'pm.collectionVariables.set("bulkStudentId", pm.response.json().data[0].user_id);']),
            req("(Öğrenci) Tek seferlik şifreyle giriş", "POST", f"{S}/auth/login", body={"login": "{{newLogin}}", "password": "{{oneTimePassword}}"},
                tests=[status(200), ok(".user.must_change_password", "true", "şifre değiştirmesi gerekiyor")]),
            req("(Öğrenci) Şifre değişmeden sınıflar kapalı", "GET", f"{S}/classrooms", tests=[status(403), err("password_change_required")]),
            req("(Öğrenci) Zayıf şifre reddedilir", "POST", f"{S}/auth/password", body={"current_password": "{{oneTimePassword}}", "new_password": "12345678"},
                tests=[status(422), err("weak_password")]),
            req("(Öğrenci) Şifresini değiştirir", "POST", f"{S}/auth/password", body={"current_password": "{{oneTimePassword}}", "new_password": "{{newStudentPassword}}"},
                tests=[status(200), ok(".user.must_change_password", "false", "artık serbest")]),
            req("(Öğrenci) Sınıfını görür", "GET", f"{S}/classrooms", tests=[status(200), 'pm.test("1 sınıf", () => pm.expect(pm.response.json().data.length).to.eql(1));']),
            req("Öğretmen şifreyi sıfırlar", "POST", f"{T}/classrooms/{{{{classroomId}}}}/students/{{{{newStudentId}}}}/reset-password",
                tests=[status(200), 'pm.collectionVariables.set("oneTimePassword", pm.response.json().data.one_time_password);'],
                description="Öğrenci tüm cihazlardan çıkarılır ve yeni tek seferlik şifreyle girip şifresini yeniden belirler."),
            req("(Öğrenci) Sıfırlamadan sonra oturum kapanmıştır", "GET", f"{S}/auth/me", tests=[status(401), err("session_expired")]),
        ],
    },
    {
        "name": "5 · Verilerim (KVKK)",
        "description": "Kişisel verilerle ilgili haklar: düzeltme, indirme, erişim kaydı ve silme. Sıfırlanan öğrenci yeni tek seferlik şifreyle girer.",
        "item": [
            req("(Öğrenci) Yeni tek seferlik şifreyle giriş", "POST", f"{S}/auth/login", body={"login": "{{newLogin}}", "password": "{{oneTimePassword}}"}, tests=[status(200)]),
            req("(Öğrenci) Yeni şifresini belirler", "POST", f"{S}/auth/password", body={"current_password": "{{oneTimePassword}}", "new_password": "{{newStudentPassword}}"}, tests=[status(200)]),
            req("(Öğrenci) Bilgilerimi düzelt", "PATCH", f"{S}/me", body={"display_name": "Ayşe K.", "age_band": "11-13"},
                tests=[status(200), ok(".age_band", '"11-13"', "yaş aralığı kaydedildi")], description="Yalnızca gönderilen alanlar değişir."),
            req("(Öğrenci) Verilerimi indir", "GET", f"{S}/me/export",
                tests=[status(200), ok(".format_version", "1", "dışa aktarma biçimi"), 'pm.test("şifre özeti yok", () => pm.expect(pm.response.text()).to.not.include("scrypt$"));'],
                description="API'de saklanan her şey tek bir JSON belgesinde (data). Kaydetmek için: Save Response → Save to a file."),
            req("(Öğrenci) Verilerime kim erişti?", "GET", f"{S}/me/access-log",
                tests=[status(200), 'pm.test("öğretmenin şifre sıfırlaması görünür", () => pm.expect(pm.response.json().data.map(e => e.action)).to.include("student_password_reset"));']),
            req("Öğretmen, oluşturduğu bir öğrenci hesabını siler", "DELETE", f"{T}/classrooms/{{{{classroomId}}}}/students/{{{{bulkStudentId}}}}",
                tests=[status(200)], description="Okuldan ayrılan öğrenciler için. Hesap ve tüm verileri kalıcı olarak silinir."),
            req("(Öğrenci) Hesabımı sil", "POST", f"{S}/me/delete", body={"password": "{{newStudentPassword}}", "confirm": True},
                tests=[status(200)], description="Geri alınamaz. Defterler, ilerleme kayıtları, raporlar ve oturumlar da silinir."),
            req("(Öğrenci) Silinen hesapla giriş yapılamaz", "POST", f"{S}/auth/login", body={"login": "{{newLogin}}", "password": "{{newStudentPassword}}"},
                tests=[status(401), err("invalid_credentials")]),
        ],
    },
    {
        "name": "6 · Çıkış",
        "item": [
            req("Öğretmen tüm cihazlardan çıkar", "POST", f"{T}/auth/logout-all", tests=[status(200)]),
            req("Çıkıştan sonra oturum yok", "GET", f"{T}/auth/me", tests=[status(401), err("not_authenticated")]),
        ],
    },
]

collection = {
    "info": {
        "name": "AI Atölye API",
        "description": "Yerel geliştirme için uçtan uca senaryo. Ortam seçmeye gerek yok: adresler koleksiyon değişkenlerinde. Sırayla çalıştır ya da Run collection ile hepsini birden çalıştır. Önce: npm run db:up ve npm run api.",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    "item": folders,
    # Addresses live in the collection itself, so it works without selecting an
    # environment. A selected environment with the same keys overrides them.
    "variable": [
        {"key": "baseUrl", "value": "http://localhost:8000/api/v1"},
        {"key": "teacherUrl", "value": "http://127.0.0.1:8000/api/v1"},
        {"key": "studentId", "value": ""},
        {"key": "classroomId", "value": ""},
        {"key": "joinCode", "value": ""},
        {"key": "newLogin", "value": ""},
        {"key": "oneTimePassword", "value": ""},
        {"key": "newStudentId", "value": ""},
        {"key": "newStudentPassword", "value": "mavi-bisiklet-yaz-2026"},
        {"key": "bulkStudentId", "value": ""},
        {"key": "notebookEtag", "value": ""},
    ],
}
environment = {
    "name": "AI Atölye · Yerel",
    "values": [
        {"key": "baseUrl", "value": "http://localhost:8000/api/v1", "type": "default", "enabled": True},
        {"key": "teacherUrl", "value": "http://127.0.0.1:8000/api/v1", "type": "default", "enabled": True},
    ],
    "_postman_variable_scope": "environment",
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "ai-atolye.postman_collection.json").write_text(json.dumps(collection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "ai-atolye-local.postman_environment.json").write_text(json.dumps(environment, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote docs/postman/ai-atolye.postman_collection.json and ai-atolye-local.postman_environment.json")
