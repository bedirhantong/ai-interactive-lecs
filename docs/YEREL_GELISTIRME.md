# Yerel geliştirme kılavuzu

Bu kılavuz, AI Atölye'yi kendi bilgisayarında çalıştırmak için gereken her şeyi anlatır: Docker (veritabanı), API, web uygulaması, DBeaver (veritabanını görmek) ve Postman (API'yi denemek).

Komutların hepsi **proje klasöründe** (`ai-interactive-lecs/`) çalıştırılır; başka bir klasör gerekiyorsa ayrıca belirtilir.

---

## 0. Parçalar ve nasıl bağlanıyorlar

```
   Öğrenci / öğretmen                    Geliştirici
          │                                     │
          ▼                                     ▼
 ┌──────────────────┐                      ┌─────────┐
 │  Web arayüzü     │                      │ Postman │
 │  localhost:3000  │                      └────┬────┘
 │  npm run dev     │                           │ HTTP istekleri
 └────────┬─────────┘                           │
          │ /api/... (Next.js yönlendirir)      ▼
          └────────────────────────────▶ ┌──────────────────┐
                                         │  API (backend)   │  ← npm run api
                                         │  localhost:8000  │    (Mac'te doğrudan çalışır)
                                         └────────┬─────────┘
                                                  │ SQL
                                                  ▼
 ┌─────────┐   doğrudan bakar             ┌──────────────────┐
 │ DBeaver │ ───────────────────────────▶ │  PostgreSQL      │  ← Docker içinde
 └─────────┘                              │  localhost:5433  │    (npm run db:up)
                                          └──────────────────┘
```

| Parça | Ne işe yarar? | Çalıştırmak için |
|---|---|---|
| **PostgreSQL** | Verileri **saklar** (kullanıcılar, sınıflar, defter kayıtları, raporlar). Kendi başına kural bilmez. | Docker içinde, port 5433 |
| **Docker** | PostgreSQL'i bilgisayara ayrıca kurmadan, izole bir kutuda çalıştırır. **Yalnızca veritabanını** çalıştırır, API'yi değil. | Docker Desktop açık + `npm run db:up` |
| **API (backend)** | Uygulamanın **beyni ve kapı görevlisi**: isteği alır, kim olduğunu ve yetkisini kontrol eder, veriyi doğrular, veritabanına yazar ya da okur. | `npm run api` (port 8000, terminal açık kalır) |
| **Postman** | Web arayüzü yerine **API'ye elle istek gönderip** test etmeye yarar. Öğrenciler kullanmaz. | Bir şey çalıştırmaz; API'nin açık olması gerekir |
| **DBeaver** | API'yi atlayıp **veritabanının içine doğrudan bakar** ("kayıt gerçekten oluştu mu?"). | Bir şey çalıştırmaz; PostgreSQL'in açık olması gerekir |
| **Web arayüzü** | Öğrencilerin kullandığı asıl ürün: dersler, deneyler, tarayıcıda Python. | `npm run dev` (port 3000) |

**Neyi test etmek için ne çalışmalı?**

| Yapmak istediğim | Docker + DB | API | Web |
|---|:-:|:-:|:-:|
| Postman ile API'yi denemek | ✔ | ✔ | — |
| DBeaver ile tabloları görmek | ✔ | — | — |
| Web arayüzünü hesapsız (demo) kullanmak | — | — | ✔ |
| Giriş, öğretmen paneli, senkronizasyon | ✔ | ✔ | ✔ |
| Backend testleri (`npm run test:api:pg`) | ✔ | — | — |

**Web arayüzü ve API nasıl bağlı?** Tarayıcı API'yi her zaman aynı adres altında çağırır (`/api/...`). Geliştirmede Next.js bu istekleri `localhost:8000`'e yönlendirir (`next.config.ts`, farklı bir adres için `API_INTERNAL_URL`); üretimde bunu Caddy yapar. Böylece oturum çerezi sorunsuz çalışır.

- **API çalışmıyorsa** web arayüzü hesapsız (demo) modda açılır; çalışma tarayıcıda kalır.
- **Giriş yapılmışsa** çalışma önce tarayıcıya kaydedilir, sonra arka planda API'ye gönderilir (çevrimdışıyken de çalışmaya devam edilir). Kurallar: [`SENKRONIZASYON.md`](SENKRONIZASYON.md).
- Hesap verileri tarayıcıda hesap başına ayrı tutulur ve çıkış yapınca o bilgisayardan silinir (okul bilgisayarları paylaşımlı).

**Web arayüzünü hesapla denemek:** API çalışırken http://localhost:3000/giris → **Demo öğretmen** ile sınıf aç, öğrenci hesabı oluştur; başka bir tarayıcı penceresinde (gizli pencere) öğrenci olarak gir.

**API neden Docker'da değil?** Geliştirmede Mac'te doğrudan çalışması daha pratik: kodu kaydedince kendini yeniden başlatır, hatalar terminalde hemen görünür. Yayına alırken API de bir Docker kutusuna konacak.

---

## Hızlı başvuru

| Ne yapmak istiyorum? | Komut |
|---|---|
| Veritabanını başlat | `npm run db:up` |
| API'yi başlat | `npm run api` → http://localhost:8000/docs |
| Web uygulamasını başlat | `npm run dev` → http://localhost:3000 |
| Veritabanını durdur (veriler kalır) | `npm run db:down` |
| Tabloları güncelle (migration) | `npm run db:migrate` |
| Backend testleri (hızlı, SQLite) | `npm run test:api` |
| Backend testleri (gerçek PostgreSQL) | `npm run test:api:pg` |
| Backend kod denetimi (lint + biçim) | `npm run lint:api` (düzeltmek için `npm run format:api`) |
| API hazır mı? (DB + migration) | http://localhost:8000/api/v1/health/ready |
| Web testleri | `npm run test:web` |
| Üretim düzenini başlat / durdur / loglar | `npm run prod:up` / `npm run prod:down` / `npm run prod:logs` (bkz. [`DAGITIM.md`](DAGITIM.md)) |
| Postman koleksiyonunu terminalden çalıştır | `npx newman run docs/postman/ai-atolye.postman_collection.json -e docs/postman/ai-atolye-local.postman_environment.json` |

**Her gün:** Docker Desktop'ı aç → `npm run db:up` → bir terminalde `npm run api` → başka bir terminalde `npm run dev`.

---

## 1. İlk kurulum (bir kez)

Gerekenler: Node.js 20+, Python 3.12+, Docker Desktop. DBeaver ve Postman isteğe bağlı.

```bash
# Web uygulaması
cd apps/web && npm install && cd ../..

# API (Python sanal ortamı)
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env          # ayarlar; zaten varsa bu adımı atla
cd ../..

# Veritabanı ve tablolar
npm run db:up
npm run db:migrate
```

Kontrol: `npm run test:api:pg` komutu `22 passed` (ya da daha fazla) yazmalı.

---

## 2. Docker: veritabanı

PostgreSQL 17, Docker içinde çalışır. Bilgisayarına ayrıca Postgres kurman gerekmez.

**Docker Desktop'ta nereye bakmalı?**
- **Containers** sekmesi: `ai-interactive-lecs` altında `db-1` yeşil (Running) olmalı.
- `db-1`'e tıkla → **Logs**: veritabanı hataları burada görünür.
- **Volumes** sekmesi: `ai-interactive-lecs_pgdata` verilerin saklandığı yerdir.

**Komutlar**

```bash
npm run db:up                  # başlat (sağlıklı olana kadar bekler)
npm run db:down                # durdur; veriler silinmez
docker compose ps              # durum
docker compose logs -f db      # canlı loglar (Ctrl+C ile çık)
docker compose exec db psql -U atolye -d atolye   # terminalden SQL (\q ile çık)
```

**Veritabanını tamamen sıfırlamak** (tüm yerel veriler silinir):

```bash
docker compose down -v         # -v: veri hacmini de siler
npm run db:up                  # boş veritabanı + atolye_test yeniden oluşur
npm run db:migrate             # tabloları yeniden kur
```

**Bilinmesi gerekenler**
- Port **5433**'tür, 5432 değil. Bilgisayarında Homebrew ile kurulu başka bir PostgreSQL 5432'yi kullanıyor; çakışmasın diye böyle ayarlandı. Değiştirmek için: `ATOLYE_DB_PORT=5434 npm run db:up` (o zaman `apps/api/.env` içindeki adresi de güncelle).
- İki veritabanı var: `atolye` (geliştirme, senin verilerin) ve `atolye_test` (otomatik testler; her test koşusunda silinip yeniden kurulur). Testler, adında "test" geçmeyen bir veritabanında çalışmayı reddeder.
- Kullanıcı/şifre `atolye`/`atolye` yalnızca yerel geliştirme içindir; veritabanı sadece bu bilgisayardan erişilebilir (`127.0.0.1`).

---

## 3. API

```bash
npm run api
# ya da: cd apps/api && .venv/bin/uvicorn app.main:app --reload --port 8000
```

- `--reload` sayesinde kodu kaydettiğinde API kendini yeniden başlatır.
- **http://localhost:8000/docs**: tüm uç noktaları gösteren ve tarayıcıdan denenebilen otomatik doküman (production'da kapalıdır).
- Durdurmak için o terminalde **Ctrl+C**.

**Ayarlar** `apps/api/.env` dosyasındadır (örnek: `apps/api/.env.example`). Önemliler:

| Değişken | Anlamı |
|---|---|
| `ATOLYE_DATABASE_URL` | Veritabanı adresi (varsayılan: Docker'daki Postgres, port 5433) |
| `ATOLYE_DEMO_MODE` | `true` iken şifresiz demo hesap açılabilir. Production'da açılamaz (API başlamayı reddeder). |
| `ATOLYE_ALLOWED_ORIGINS` | API'yi çağırabilecek web adresleri (varsayılan `http://localhost:3000`) |

**Hesaplar nasıl oluşur?**

| Kim | Nasıl giriş yapar? | Hesabı kim açar? |
|---|---|---|
| Yönetici | e-posta + şifre | Terminalden: `python -m app.cli create-user --role admin ...` |
| Öğretmen | e-posta + şifre | Yönetici (`POST /admin/teachers`) ya da terminalden `create-user --role teacher` |
| Öğrenci | **kullanıcı adı** + şifre (e-posta yok) | Öğretmen, kendi sınıfına: `POST /classrooms/{id}/students` ya da `.../students/bulk` |
| Demo | şifresiz | Herkes (yalnızca `ATOLYE_DEMO_MODE=true` iken) |

- Öğretmenin açtığı öğrenci hesabı bir **tek seferlik şifre** ile gelir (ör. `k7mp-3xqa-9fde`). Bu şifre yalnızca o yanıtta görünür.
- Tek seferlik şifreyle giren kullanıcı, **şifresini değiştirene kadar** yalnızca `/auth/me`, `/auth/password` ve çıkış uçlarını kullanabilir; diğerleri `403 password_change_required` döner.
- Öğrencinin şifresini unutması hâlinde öğretmen `POST /classrooms/{id}/students/{user_id}/reset-password` ile yenisini üretir; öğrenci tüm cihazlardan çıkarılır.
- **Şifre kuralları:** öğrenci en az 8, öğretmen/yönetici en az 12 karakter. Çok yaygın şifreler (ör. `12345678`, `galatasaray`) ve adı ya da kullanıcı adını içeren şifreler kabul edilmez. Büyük harf/rakam/sembol zorunluluğu yok; uzun bir cümle en iyisidir (ör. `mavi-bisiklet-yaz-2026`).
- Şifre değiştirince **tüm diğer cihazlardaki oturumlar kapanır.**

Terminalden yönetici oluşturmak (şifre terminalde sorulur, kodda saklanmaz):

```bash
cd apps/api
.venv/bin/python -m app.cli create-user --role admin --email admin@okul.example --name "Yönetici"
```

**Kaba kuvvet koruması.** 15 dakika içinde aynı hesaba 5 hatalı giriş ya da aynı ağdan 30 hatalı giriş olursa API **429** döner ve `Retry-After` başlığında kaç saniye beklenmesi gerektiğini söyler. Kalıcı hesap kilidi yoktur (bir sınıf arkadaşı başkasının hesabını kilitleyemesin diye). Bilinmeyen kullanıcı adı ile yanlış şifre aynı cevabı alır; böylece hangi kullanıcı adlarının var olduğu anlaşılmaz.

**Senkronizasyon kuralları.** Defter kaydederken sürüm başlığı zorunludur: ilk kayıt `If-None-Match: *`, sonrakiler `If-Match: "<sürüm>"` (yanıttaki `ETag`). Arada başka bir cihaz kaydetmişse **412**, başlık yoksa **428** döner. İlerleme olayları `client_event_id` taşır; aynı olay tekrar gönderilirse yok sayılır. Ayrıntılar: [`SENKRONIZASYON.md`](SENKRONIZASYON.md).

**Kişisel veriler (KVKK).** Her kullanıcı kendi verileri için şunları yapabilir:

| Uç nokta | Ne yapar? |
|---|---|
| `PATCH /me` | Görünen adı ve yaş aralığını düzeltir (yalnızca gönderilen alanlar değişir) |
| `GET /me/export` | API'de saklanan her şeyi tek bir JSON belgesinde verir (`data`). Şifre özeti ve oturum anahtarları dahil edilmez. |
| `GET /me/access-log` | "Verime kim, ne zaman erişti?": öğretmenin ilerleme/rapor görüntülemeleri, hesap oluşturma, şifre sıfırlama, onay, sınıftan çıkarma |
| `POST /me/delete` | Hesabı ve tüm verilerini **kalıcı olarak** siler. Gövde: `{"password": "...", "confirm": true}` (demo hesaplarda şifre yok) |
| `DELETE /classrooms/{id}/students/{user_id}` | Öğretmen, **kendi oluşturduğu** bir öğrenci hesabını siler (okuldan ayrılan öğrenci için) |

- Öğretmenin öğrenci verisine her bakışı erişim kaydına yazılır. Bu kayıt işlemle aynı veritabanı işleminde (transaction) yazılır; kayıt düşmeden veri gösterilemez.
- Hesap silindiğinde erişim kayıtları kalır ama artık o kişiyi göstermez (kişiye bağlantı silinir).
- Öğretmen hesabı silinirse sınıfları ve ödevleri de silinir; oluşturduğu öğrenci hesapları kalır (onlar öğrencilerindir).
- Hukuki konular ve açık kararlar: [`KVKK_NOTLARI.md`](KVKK_NOTLARI.md).

**Günlük temizlik.** Süresi dolmuş oturumları, 7 günden eski giriş denemesi kayıtlarını, 1 günden eski demo hesaplarını ve saklama süresi (varsayılan 365 gün) dolan erişim kayıtlarını siler. `ATOLYE_INACTIVE_STUDENT_RETENTION_DAYS` ayarlanırsa o kadar gündür giriş yapmayan öğrenci hesaplarını da siler; bu ayar varsayılan olarak kapalıdır. Production'da günde bir kez zamanlanmış görev (cron) olarak çalıştırılmalıdır:

```bash
cd apps/api && .venv/bin/python -m app.cli cleanup
```

**Önemli kural:** Durum değiştiren her istek (POST, PUT, DELETE) `x-atolye-client: 1` başlığını taşımalıdır. Bu, çerezle çalışan oturumlar için CSRF korumasıdır; başlık yoksa API **403** döner.

**Sağlık kontrolleri**

| Adres | Ne söyler? |
|---|---|
| `/api/v1/health/live` | API süreci ayakta mı? (veritabanına bakmaz) |
| `/api/v1/health/ready` | Veritabanı cevap veriyor mu **ve** şema en son migration'da mı? Değilse **503** döner ve sebebini söyler (`database_unavailable` ya da `migrations_pending`). |

**Yanıt formatı (base response).** Bütün uç noktalar aynı zarfla döner:

```json
// başarılı
{"success": true, "data": {...}, "meta": {"request_id": "9a5a859ab927…", "pagination": null}}
// hata
{"success": false, "error": {"code": "classroom_not_found", "message": "Sınıf bulunamadı.", "request_id": "3305517389da…", "details": [...]}}
```

- Önce `success`'e bak; sonra `data`'yı ya da `error.code`'u oku.
- Sayfalı listelerde (ör. ilerleme olayları) sonraki sayfa `meta.pagination.next_cursor` içindedir; bunu `?cursor=` olarak gönder.

- `code`: sabit, makinenin okuyacağı kod. Web arayüzü buna göre davranır; mesaj metnine göre değil.
- `message`: Türkçe, öğrenciye gösterilebilir.
- `request_id`: yanıttaki `X-Request-ID` başlığıyla ve loglardaki kayıtla aynıdır.
- `details`: yalnızca doğrulama hatalarında, hangi alanların hatalı olduğu. Gönderilen veri asla geri yansıtılmaz.
- Beklenmeyen hatalarda (500) iç hata mesajı ya da stack trace istemciye **gönderilmez**; yalnızca loglara yazılır.

**Loglar.** API, terminale her satırı bir JSON nesnesi olan loglar yazar. Her istek için bir satır vardır (`method`, `path`, `status`, `duration_ms`, `request_id`). Bir hatayı araştırırken yanıttaki `request_id`'yi terminalde ara (Cmd+F): o isteğin tüm kayıtları gelir. İstek ve yanıt gövdeleri (öğrenci verileri) loglanmaz.

---

## 4. Migration (tablo değişiklikleri)

Tablolar `apps/api/app/models.py` dosyasındaki modellerden gelir. Veritabanı yapısı **asla elle (DBeaver'dan) değiştirilmez**; her değişiklik bir migration dosyasıyla yapılır:

```bash
cd apps/api
# 1) models.py'yi değiştir
# 2) migration dosyasını üret
.venv/bin/alembic revision --autogenerate -m "kısa açıklama"
# 3) migrations/versions/ altındaki yeni dosyayı OKU ve kontrol et
# 4) uygula
.venv/bin/alembic upgrade head
# 5) modellerle veritabanı uyuşuyor mu?
.venv/bin/alembic check          # "No new upgrade operations detected" görmelisin
```

Faydalı komutlar: `alembic current` (veritabanı hangi sürümde), `alembic history` (tüm migration'lar), `alembic downgrade -1` (son migration'ı geri al).

---

## 5. DBeaver: veritabanını görmek

**Bağlantıyı kurmak (bir kez)**
1. Sol üstteki **fiş ikonu (New Database Connection)** → **PostgreSQL** → **Next**.
2. Bilgileri gir:

   | Alan | Değer |
   |---|---|
   | Host | `localhost` |
   | Port | **`5433`** |
   | Database | `atolye` |
   | Username | `atolye` |
   | Password | `atolye` |

3. **Test Connection**. İlk seferde sürücü indirmeyi önerirse **Download** de. "Connected" görünce **Finish**.
4. Bağlantıya sağ tık → **Rename** → "AI Atölye (yerel)" gibi bir ad ver.

**Tabloları bulmak:** `atolye → Databases → atolye → Schemas → public → Tables`

| Tablo | İçinde ne var? |
|---|---|
| `users` | Kullanıcılar (rol, görünen ad, demo mu?) |
| `sessions` | Oturumlar. Yalnızca token'ın özeti saklanır, token'ın kendisi değil. |
| `student_notebooks` | Öğrencinin son defter kaydı (ders başına bir satır) |
| `progress_events` | Öğrenme kanıtları (görev tamamlandı, model eğitildi…) |
| `training_reports` | Yüklenen Colab raporları |
| `classrooms`, `classroom_memberships`, `assignments` | Sınıflar, üyelikler (onay bekliyor / aktif), ödevler |
| `alembic_version` | Veritabanının hangi migration sürümünde olduğu |

**İpuçları**
- Bir tabloya çift tıkla → **Data** sekmesi verileri gösterir. Yeni veri geldiyse **F5** ile yenile.
- **ER Diagram** sekmesi tabloların ilişkilerini çizer.
- SQL yazmak için bağlantıya sağ tık → **SQL Editor → New SQL script**. Satırı seçip **Ctrl+Enter** (Mac'te **Cmd+Enter**) ile çalıştır.

**Faydalı sorgular**

```sql
-- Son kullanıcılar
SELECT id, role, display_name, is_demo, created_at FROM users ORDER BY created_at DESC LIMIT 20;

-- Bir öğrencinin son ilerleme olayları
SELECT lesson_id, cell_id, kind, detail, occurred_at
FROM progress_events ORDER BY id DESC LIMIT 20;

-- Colab raporları ve test doğrulukları
SELECT u.display_name, r.lesson_id, r.test_accuracy, r.verification, r.created_at
FROM training_reports r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC;

-- Sınıflar ve üye sayıları
SELECT c.name, c.join_code, m.status, count(*) AS uye
FROM classrooms c LEFT JOIN classroom_memberships m ON m.classroom_id = c.id
GROUP BY c.name, c.join_code, m.status;
```

**Kural:** DBeaver'ı yerelde verileri **görmek** için kullan. Yapı değişikliği her zaman migration ile yapılır (bölüm 4). Production veritabanında DBeaver'dan veri düzenleme.

---

## 6. Postman: API'yi denemek

Elle istek kurmana gerek yok; hazır koleksiyon `docs/postman/` klasöründe.

**İçe aktarmak (bir kez)**
1. API çalışıyor olsun (`npm run api`).
2. Postman'de sol üstte **Import** → `docs/postman/ai-atolye.postman_collection.json` dosyasını seç.
3. Bu kadar. Ortam seçmene gerek yok: adresler (`baseUrl`, `teacherUrl`) koleksiyonun kendi değişkenlerinde. Görmek için koleksiyon adına tıkla → **Variables** sekmesi.

> İsteğe bağlı: `ai-atolye-local.postman_environment.json` dosyasını da içe aktarıp sağ üstteki ortam menüsünden seçersen, adresleri oradan değiştirebilirsin (ör. API'yi başka bir portta çalıştırırken). Seçili ortamdaki değerler koleksiyondakileri geçersiz kılar.

**Çalıştırmak**
- **Tek tek:** Soldan klasörleri **sırayla** aç (1 → 4), her isteği **Send** ile gönder. Alttaki **Test Results** sekmesinde yeşil tikler görünür. Sıra önemlidir: önce oturum açılır, sınıf kodu bir önceki isteğin sonucundan alınır.
- **Hepsi birden:** koleksiyon adının yanındaki **⋯ → Run collection → Run**. 23 isteğin hepsi yeşil olmalı.

**Klasörler**
1. **Sistem:** sağlık kontrolü.
2. **Öğrenci (demo):** oturum, CSRF testi, defter kaydet/getir, ilerleme olayları, Colab raporu yükleme, tutarsız raporun reddi.
3. **Öğretmen ve sınıf:** sınıf oluşturma, öğrencinin kodla katılması, onay, ödev, öğretmenin öğrenci ilerlemesini görmesi.
4. **Çıkış:** çıkış ve oturumun kapandığının kontrolü.

**Nasıl çalışıyor?**
- Oturum bir **çerezde** tutulur; Postman çerezi otomatik saklar ve sonraki isteklerde gönderir. Görmek için **Send** düğmesinin altındaki **Cookies** bağlantısına tıkla.
- Öğrenci `localhost`, öğretmen `127.0.0.1` adresini kullanır. Postman çerezleri adrese göre ayrı tuttuğu için öğretmen ve öğrenci iki ayrı oturumla aynı anda çalışabilir.
- Her baştan başlamak istediğinde 2. klasördeki "Demo öğrenci oturumu aç" isteğinden başla.
- Postman çerezleri **çalıştırmalar arasında saklar**. Önceki çalıştırmadan kalan, artık geçersiz bir oturum çerezi gönderildiğinde API `401 session_expired` döner (çerez yoksa `401 not_authenticated`); ikisi de doğrudur. Çerezleri temizlemek için: **Send** düğmesinin altındaki **Cookies** → `localhost` ve `127.0.0.1` → sil.

**Koleksiyonu güncellemek:** API'de uç nokta değiştiğinde `python3 scripts/build_postman_collection.py` çalıştır ve Postman'de yeniden **Import** et (üzerine yazmayı seç).

**Terminalden aynı kontroller:** Postman'i açmadan, bölüm başındaki `npx newman run ...` komutuyla.

---

## 7. Sık karşılaşılan sorunlar

| Belirti | Sebep ve çözüm |
|---|---|
| `docker: command not found` | Docker Desktop kapalı ya da terminal yeni açılmamış. Docker Desktop'ı aç, yeni bir terminal penceresi aç. |
| `port is already allocated` / `address already in use` (5433) | Başka bir şey 5433'ü kullanıyor. `lsof -nP -iTCP:5433 -sTCP:LISTEN` ile bak ya da `ATOLYE_DB_PORT` ile başka port seç (bölüm 2). |
| `address already in use` (8000) | API zaten çalışıyor. Diğer terminali kontrol et ya da `lsof -nP -iTCP:8000 -sTCP:LISTEN` ile süreci bul. |
| Postman'de `connect ECONNREFUSED 127.0.0.1:8000` | **API çalışmıyor.** Bir terminalde `npm run api` çalıştır ve o terminali açık bırak. Kontrol: http://localhost:8000/api/v1/health |
| API başlarken `connection refused` | Veritabanı kapalı: `npm run db:up`. |
| API başlarken `relation "users" does not exist` | Tablolar kurulmamış: `npm run db:migrate`. |
| **429** `too_many_login_attempts` | Çok fazla hatalı giriş. `Retry-After` başlığındaki süre kadar bekle. Yerelde hemen açmak için: `docker compose exec db psql -U atolye -d atolye -c "delete from auth_attempts"` |
| **428** `precondition_required` (defter kaydında) | `If-None-Match: *` (ilk kayıt) ya da `If-Match: "<sürüm>"` başlığı eksik. |
| **412** `notebook_revision_conflict` | Defter arada başka bir yerden kaydedilmiş. `GET` ile güncel sürümü al, `error.details[0].current_revision` ile tekrar kaydet. |
| **403** `password_change_required` | Tek seferlik şifreyle giriş yapıldı. Önce `POST /auth/password` ile şifreyi değiştir. |
| **422** `weak_password` | Yeni şifre kurallara uymuyor; nedenleri `error.details` içinde. |
| `/health/ready` **503** `migrations_pending` | Kodda yeni bir migration var ama veritabanına uygulanmamış: `npm run db:migrate`. |
| Bir hatanın sebebini bulamıyorum | Yanıttaki `request_id` değerini API'nin çalıştığı terminalde ara; o isteğe ait log ve hata satırları çıkar. |
| DBeaver bağlanmıyor | Port **5433** mü? Docker'da `db-1` çalışıyor mu? Şifre `atolye` mı? |
| DBeaver bağlanıyor ama tablo yok | Başka bir Postgres'e (5432) bağlanmış olabilirsin; portu kontrol et. Ya da `npm run db:migrate` çalıştır. |
| Postman'de `{{baseUrl}}` kırmızı / istek gitmiyor | Koleksiyonun eski sürümü yüklü. `docs/postman/ai-atolye.postman_collection.json` dosyasını yeniden **Import** et ve "Replace" seç. Ya da boş değerli bir ortam seçili olabilir: sağ üstten **No environment** seç. |
| Postman'de **401** | Oturum yok ya da süresi doldu. "Demo öğrenci oturumu aç" isteğini yeniden gönder. |
| Postman'de beklenen `not_authenticated` yerine `session_expired` | Önceki çalıştırmadan kalan eski bir oturum çerezi gönderiliyor. Normaldir; temizlemek için **Cookies** → `localhost` / `127.0.0.1` → sil. |
| Postman'de **403** "CSRF koruması" | `x-atolye-client: 1` başlığı eksik (POST/PUT/DELETE için zorunlu). |
| Demo oturumunda **404** "Demo modu kapalı" | `apps/api/.env` içinde `ATOLYE_DEMO_MODE=true` olmalı. API'yi yeniden başlat. |
| E2E testlerinde `Another next dev server is already running` | Next.js bir klasörde tek geliştirme sunucusuna izin verir. `npm run dev` açıksa testleri ona karşı çalıştır: `cd apps/web && PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test` |
| `npm run test:api:pg` "Refusing to run" | Test adresi `atolye_test` dışında bir veritabanını gösteriyor; testler geliştirme verini silmesin diye çalışmayı reddeder. |
| `atolye_test` veritabanı yok | Veri hacmi init betiğinden önce oluşturulmuş. `docker compose exec db createdb -U atolye atolye_test` ya da sıfırla (bölüm 2). |

---

## 8. Backend'e yeni özellik eklerken kurallar

Backend katmanlıdır. Her katmanın tek bir sorumluluğu vardır; bu yapıyı korumak için yeni bir özellik şu sırayla eklenir:

```
istek → route (HTTP) → servis (iş kuralı) → repository (veritabanı) → model
                         ↑ bağımlılıklar app/api/deps.py'de bağlanır
```

| Katman | Klasör | Ne yapar? | Ne yapmaz? |
|---|---|---|---|
| **Model** | `app/models.py` | Tablolar | İş kuralı içermez |
| **Repository** | `app/repositories/` | Sorgular (getir, ekle, listele) | `commit` etmez, yetki kontrolü yapmaz |
| **Domain** | `app/domain/` | Saf kurallar (şifre politikası, kullanıcı adı, rapor sözleşmesi) ve **domain hataları** | Veritabanına ve HTTP'ye dokunmaz |
| **Servis** | `app/services/` | Bir kullanım senaryosu: yetki kontrolü, kurallar, `uow.commit()` | HTTP bilmez (`Request`, durum kodu yok); hata için `app/domain/errors.py`'deki sınıfları fırlatır |
| **Şema (DTO)** | `app/api/schemas/` | İstek ve yanıt biçimleri (Pydantic) | Veritabanı modeli döndürmez |
| **Route** | `app/api/routes/` | İsteği al, servisi çağır, `ok(...)` ile zarfa koy | İş kuralı ve SQL içermez |
| **DI** | `app/api/deps.py` | Hangi somut sınıfın kullanılacağına karar verir | — |

**Kontrol listesi**

1. Yeni tablo ya da sütun → `models.py`, sonra `alembic revision --autogenerate`, **dosyayı oku**: `NOT NULL` sütunlarda `server_default` var mı, kısıtların **adı** var mı? Sonra `alembic upgrade head` ve `alembic check`.
2. Hata gerekiyorsa uygun domain hatasını sabit bir `code` ile fırlat: `raise NotFound("Sınıf bulunamadı.", code="classroom_not_found")`. HTTP durum kodunu yazma; eşleme `app/core/errors.py`'de tek yerdedir.
3. Route her zaman `response_model=ApiResponse[...]` ve `return ok(...)` kullanır. Hiçbir uç nokta zarfın dışında yanıt dönmez.
4. Bağımlılıkları servisin yapıcısına (constructor) ver; servisin içinde `get_settings()`, `datetime.now()` ya da `Session()` çağırma. Saat için `Clock`, şifre için `PasswordHasher` arayüzünü kullan.
5. Test yaz: başarı, yetkisiz erişim, hatalı giriş. Hata kontrolü için `error(response, status, code)`, veri için `data(response)` yardımcılarını kullan.
6. `npm run lint:api`, `npm run test:api` ve `npm run test:api:pg` geçmeli. Uç nokta değiştiyse `python3 scripts/build_postman_collection.py`.
