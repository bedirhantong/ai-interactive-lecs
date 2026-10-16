# Senkronizasyon sözleşmesi (web arayüzü ↔ API)

Web arayüzü **çevrimdışı önce** çalışır: her şey önce tarayıcıya (localStorage) yazılır. Oturum açıksa değişiklikler arka planda API'ye gönderilir. Bu belge, bunun güvenli olması için API'nin sunduğu kuralları ve istemcinin uyması gereken algoritmayı anlatır.

## 1. Defterler: sürüm kontrolü (ETag / If-Match)

Her defter kaydının bir `revision` numarası vardır. Yanıtlarda hem gövdede (`data.revision`) hem `ETag` başlığında (`"3"`) gelir.

| Durum | İstek | Başarılı | Hata |
|---|---|---|---|
| Bu ders için ilk kayıt | `PUT /notebooks/{ders}` + `If-None-Match: *` | **201**, `revision: 1` | **412** zaten kayıt var |
| Sonraki kayıtlar | `PUT /notebooks/{ders}` + `If-Match: "<revision>"` | **200**, `revision + 1` | **412** arada başka kayıt yapılmış |
| Başlıksız kayıt | — | — | **428** `precondition_required` |

412 yanıtında `error.code = "notebook_revision_conflict"` ve `error.details[0].current_revision` vardır.

Sunucu, kontrol ile yazmayı **tek bir koşullu SQL güncellemesinde** yapar. Aynı anda gelen iki kayıttan yalnızca biri kazanır; kayıp güncelleme olmaz.

**İstemci algoritması**

1. **Açılışta:** `GET /notebooks` → her ders için `revision`. Yerelde saklanan `serverRevision` ile karşılaştır.
   - Sunucudaki daha yeniyse ve yerelde gönderilmemiş değişiklik yoksa: `GET /notebooks/{ders}` ile indir, yereli güncelle.
   - Hem sunucuda hem yerelde değişiklik varsa: **çakışma** (bkz. 3. madde).
2. **Kaydederken (debounce ile, ör. 2 sn):** yerel kayıt her zaman hemen yapılır. API'ye `If-Match: "<serverRevision>"` ile gönderilir. Yanıttaki `ETag` yeni `serverRevision` olarak saklanır.
3. **412 gelirse:** sunucudaki hâli al (`GET`). Öğrenciye sor ya da kural uygula:
   - "Bu cihazdakini kullan" → sunucunun güncel sürümüyle `If-Match` yapıp yereli gönder.
   - "Diğer cihazdakini kullan" → sunucudakini yerele yaz.

   Hücre bazında birleştirme ileride eklenebilir; sunucu bunu engellemez.
4. **Ağ hatası / çevrimdışı:** yerel kayıt güvende. Bağlantı gelince 2. adımdan devam et.

## 2. İlerleme olayları: tekrar gönderilebilir (idempotent)

Her olay istemcinin ürettiği bir `client_event_id` taşır (ör. `crypto.randomUUID()`, 8–64 karakter, harf/rakam/`-`/`_`).

- İstemci olayları yerel bir kuyrukta tutar ve toplu gönderir (`POST /progress/events`, en fazla 100).
- Yanıt `{"stored": n, "duplicates": m}` olur. Aynı kimlikle daha önce gönderilmiş olaylar **yok sayılır**.
- Bu yüzden kuyruk, başarılı yanıt gelene kadar aynı olayları **güvenle tekrar gönderebilir**. Bağlantı yanıt gelmeden koparsa da sorun olmaz.
- Başarılı yanıttan sonra o olaylar kuyruktan silinir.

## 3. Colab raporları: aynı içerik bir kez

`POST /reports?lesson_id=...` aynı rapor içeriği (anahtar sırası ve boşluklar önemsiz) için ikinci seferde **200** ve kayıtlı raporu döner; ilk seferde **201**. Tekrar denemek güvenlidir.

## 4. Genel kurallar

- Durum değiştiren her istekte `x-atolye-client: 1` başlığı ve `credentials: "include"` (çerez) gerekir.
- Tarayıcı `ETag`, `X-Request-ID` ve `Retry-After` başlıklarını okuyabilir (CORS'ta izinli).
- **401** `session_expired` → yerel çalışma devam eder, kullanıcıya "tekrar giriş yap" gösterilir. Kuyruklar korunur.
- **403** `password_change_required` → şifre değiştirme ekranı.
- **429** → `Retry-After` kadar bekle.
- Her hata yanıtında `error.request_id` vardır; destek isterken bu kimlik paylaşılır.
