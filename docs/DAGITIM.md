# Dağıtım (production) kılavuzu

Bu belge AI Atölye'yi tek bir Linux sunucuda yayına almayı anlatır. Tasarım, tek kişinin işletebileceği kadar basit tutuldu: **bir sunucu, Docker Compose, otomatik HTTPS.** GPU, Kubernetes ya da öğrenci başına sunucu yoktur; öğrencilerin Python kodu kendi tarayıcılarında ya da kendi Colab oturumlarında çalışır.

```
İnternet ──443──▶ proxy (Caddy, otomatik HTTPS)
                    ├── /api/*  ──▶ api (FastAPI, uvicorn)  ──▶ db (PostgreSQL 17)
                    └── diğer   ──▶ web (Next.js)
                  migrate     : her başlangıçta "alembic upgrade head", sonra çıkar
                  maintenance : günde bir "python -m app.cli cleanup"
```

Yalnızca `proxy` dışarıya port açar. Veritabanı, API ve web yalnızca iç ağdadır.

## 1. Gereksinimler

- Bir Linux sunucu (başlangıç için 2 vCPU / 4 GB RAM yeterli), Docker Engine + Docker Compose eklentisi.
- Bir alan adı ve bu alan adının sunucuya yönlenen bir DNS **A** kaydı.
- Sunucuda **80 ve 443** portlarının dışarıya açık olması (HTTPS sertifikası için).

## 2. Ortam değişkenleri

`deploy/.env.prod.example` dosyasını `deploy/.env.prod` olarak kopyalayıp doldur. **Bu dosya asla git'e eklenmez** (`.gitignore` engeller).

| Değişken | Zorunlu | Açıklama |
|---|:-:|---|
| `SITE_ADDRESS` | ✔ | Alan adı, ör. `atolye.okulum.k12.tr`. Caddy bunun için sertifika alır. |
| `POSTGRES_PASSWORD` | ✔ | Veritabanı şifresi. |
| `ATOLYE_SECRET_KEY` | ✔ | En az 32 karakter rastgele değer. Giriş denemesi kayıtlarındaki anahtarlı özetler için. |
| `NEXT_PUBLIC_COLAB_GITHUB_REPO` |  | `kullanici/repo`: "Google Colab'da Aç" düğmesini etkinleştirir (depo herkese açık olmalı). Derleme sırasında koda gömülür. |
| `WEB_CONCURRENCY` |  | API işlem sayısı (varsayılan 2; çekirdek başına 1–2). |
| `ATOLYE_AUDIT_RETENTION_DAYS` |  | Erişim kayıtlarının saklanma süresi (varsayılan 365). |
| `ATOLYE_INACTIVE_STUDENT_RETENTION_DAYS` |  | Boşsa kapalı. Okul karar verirse: bu kadar gün giriş yapmayan öğrenci hesapları silinir. |
| `IMAGE_TAG` |  | İmaj etiketi; geri dönüş için commit kimliği önerilir. |

Gizli değer üretmek için: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`

Şu ayarlar compose dosyasında **sabittir** ve değiştirilemez: `ATOLYE_ENV=production`, `ATOLYE_COOKIE_SECURE=true`, `ATOLYE_DEMO_MODE=false`. API, production'da demo modu açıksa, çerez güvenli değilse ya da gizli anahtar zayıfsa **başlamayı reddeder.**

## 3. İlk kurulum

```bash
git clone <repo> ai-atolye && cd ai-atolye
cp deploy/.env.prod.example deploy/.env.prod     # doldur
docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod up -d --build --wait

# İlk yönetici hesabı (şifre terminalde sorulur; en az 12 karakter, adı içermemeli)
docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod run --rm api \
  python -m app.cli create-user --role admin --email yonetici@okul.example --name "Okul Yöneticisi"

# Doğrulama: tüm güvenlik kontrolleri (geçici bir yönetici hesabı da oluşturur)
scripts/prod_smoke_test.sh deploy/.env.prod https://atolye.okulum.k12.tr
```

Öğretmen hesapları yönetici tarafından `POST /api/v1/admin/teachers` ile, öğrenci hesapları öğretmenler tarafından açılır (bkz. `YEREL_GELISTIRME.md`).

## 4. Güncelleme

```bash
git pull
IMAGE_TAG=$(git rev-parse --short HEAD) docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod up -d --build --wait
```

Başlangıç sırası otomatiktir: veritabanı hazır → **migrate** (yeni migration'lar uygulanır) → API ve web yeniden başlar. Migration başarısız olursa API **başlamaz**: eski konteynerler durdurulmadan önce `migrate` hata verir, sistem bozuk bir şemayla çalışmaz.

**Geri dönüş (rollback):** önceki commit'e dön ve aynı komutu çalıştır. Önceki imaj etiketi duruyorsa yeniden derleme bile gerekmez. Migration geri alınacaksa (dikkat: veri kaybı olabilir) önce yedek al, sonra:
`docker compose ... run --rm api alembic downgrade <revizyon>`.

**Migration kuralları (kesintisiz güncelleme için):** sütun silme ya da yeniden adlandırma iki sürümde yapılır: önce yeni yapı eklenir ve kod iki yapıyla da çalışır; bir sonraki sürümde eski yapı kaldırılır. Her migration `alembic downgrade` ile geri alınabilir olmalı ve CI'da PostgreSQL'e karşı sınanır.

## 5. Günlük temizlik ve saklama süreleri

`maintenance` servisi günde bir kez `python -m app.cli cleanup` çalıştırır ve sonucu loglar. Son başarılı temizlik 26 saatten eskiyse servis `unhealthy` görünür (`docker compose ps`); böylece durmuş bir temizlik görevi fark edilir.

| Ne silinir | Ne zaman |
|---|---|
| Süresi dolmuş ya da kapatılmış oturumlar | 1 gün sonra |
| Giriş denemesi kayıtları (anahtarlı özet) | 7 gün sonra |
| Demo hesapları (production'da oluşmaz) | 1 gün sonra |
| Erişim kayıtları | `ATOLYE_AUDIT_RETENTION_DAYS` (365) gün sonra |
| Uzun süre giriş yapmayan öğrenci hesapları | Yalnızca `ATOLYE_INACTIVE_STUDENT_RETENTION_DAYS` ayarlıysa |

Elle çalıştırmak: `docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod run --rm api python -m app.cli cleanup`

## 6. Yedekleme ve geri yükleme

Veritabanı tek kalıcı veridir (ders içeriği imajın içindedir). Günlük yedek, sunucunun cron'una:

```bash
# /etc/cron.d/ai-atolye-backup  (her gece 03:00, 14 gün sakla)
0 3 * * * root cd /opt/ai-atolye && docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod exec -T db pg_dump -U atolye -Fc atolye > /var/backups/atolye-$(date +\%F).dump && find /var/backups -name 'atolye-*.dump' -mtime +14 -delete
```

Geri yükleme: `docker compose ... exec -T db pg_restore -U atolye -d atolye --clean < yedek.dump`

Yedekleri sunucu dışında (şifreli) da sakla. Silinen kişisel veriler yedeklerde yedek saklama süresi boyunca kalır; bu süre `KVKK_NOTLARI.md`'de belirtilmelidir.

## 7. İzleme ve loglar

- **Sağlık:** `https://<alan-adı>/api/v1/health/ready` hem veritabanını hem migration durumunu kontrol eder (değilse 503). Bunu ücretsiz bir uptime servisine bağla.
- **Loglar:** `docker compose -f deploy/compose.prod.yml --env-file deploy/.env.prod logs -f api` — her satır JSON. Bir hata bildirildiğinde yanıttaki `request_id` ile ara. İstek gövdeleri (öğrenci verisi) loglanmaz.
- Docker log boyutu: `/etc/docker/daemon.json` içinde `{"log-driver":"local","log-opts":{"max-size":"20m","max-file":"5"}}`.

## 8. Ölçek ve maliyet

- Hesaplamanın neredeyse tamamı öğrencinin tarayıcısında (Görsel Lab, Python/Pyodide) ya da kendi Colab oturumunda yapılır. Sunucu yalnızca küçük JSON kayıtlarını saklar.
- İlk darboğaz büyük ihtimalle veritabanı bağlantıları ve defter kayıtlarının sıklığı olur (istemci kayıtları geciktirerek gönderir). **Gerçek kapasite yük testi yapılmadan iddia edilmemelidir.**
- Başlangıç maliyeti: tek bir küçük sanal sunucu + alan adı. GPU, yönetilen Kubernetes ya da ücretli API gerekmez.

## 9. Yayına almadan önce kontrol listesi

- [ ] `deploy/.env.prod` dolduruldu; gizli değerler rastgele ve başka yerde kullanılmıyor.
- [ ] DNS kaydı sunucuyu gösteriyor; 80/443 açık; `https://` ile site açılıyor.
- [ ] `scripts/prod_smoke_test.sh` tüm kontrollerden geçti.
- [ ] İlk yönetici hesabı oluşturuldu; smoke test'in oluşturduğu geçici yönetici hesapları silindi.
- [ ] Gece yedeği kuruldu ve **bir kez geri yükleme denendi.**
- [ ] Uptime izlemesi `/api/v1/health/ready` adresine bağlandı.
- [ ] `docs/KVKK_NOTLARI.md`'deki açık konular okul/hukuk birimiyle netleştirildi (aydınlatma metni, veli onayı, saklama süreleri, VERBİS).
- [ ] Sunucu güncellemeleri (otomatik güvenlik yamaları) açık; SSH yalnızca anahtarla.
