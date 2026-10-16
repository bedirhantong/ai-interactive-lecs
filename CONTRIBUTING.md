# Katkı rehberi

AI Atölye'ye katkıda bulunmak istediğin için teşekkürler! Bu proje, Türkiye'deki 11–18 yaş öğrenciler için Türkçe, uygulamalı bir yapay zekâ öğrenme ortamı. En çok ihtiyaç duyulan katkılar:

1. **Ders içeriği:** yeni dersler, düzeltmeler, öğretmen notları. Kod bilmeden de katkı verebilirsin.
2. **Öğretmen geri bildirimi:** sınıfta kullandıysan ne işe yaradı, ne yaramadı? Bir issue aç.
3. **Hata düzeltmeleri ve erişilebilirlik iyileştirmeleri.**

> English: contributions are welcome in English too. Student-facing text must be in Turkish.

## Başlamadan önce

- Büyük bir değişiklik düşünüyorsan önce bir **issue** açıp konuşalım; böylece emeğin boşa gitmez.
- Davranış kurallarımız: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
- Güvenlik açığı bulduysan issue açma; [`SECURITY.md`](SECURITY.md)'deki yolu izle.

## Geliştirme ortamı

Kurulum, Docker, API, DBeaver ve Postman: [`docs/YEREL_GELISTIRME.md`](docs/YEREL_GELISTIRME.md). Kısaca:

```bash
cd apps/web && npm install && npm run dev        # http://localhost:3000 (API olmadan da çalışır)
npm run db:up && npm run db:migrate && npm run api   # isteğe bağlı: API + PostgreSQL
```

## Ders eklemek

Dersler `content/notebooks/*.json` dosyalarıdır ve `apps/web/lib/content/schema.ts` şemasıyla doğrulanır.

1. Mevcut bir dersi kopyala (ör. `python-ilk-adimlar.json`) ve `id`'yi değiştir.
2. `labs` alanını hücrelerle uyumlu tut (`visual`, `python`, `colab`); uyumsuzsa testler söyler.
3. Bir öğrenme yoluna ekle: `content/learning-paths/*.json`.
4. Bir dersi sonradan değiştirirken hücreler değiştiyse `version`'ı artır; öğrencilerin kayıtlı çalışması hücre bazında taşınır.
5. Kontrol: `cd apps/web && npm test` (içerik doğrulaması dahil).

İlkeler: her ders bir şey **yaptırmalı** (yalnızca okutmamalı); "tamamlandı" yalnızca gözlemlenebilir bir eylemle kazanılır; sentetik veriyi sentetik olarak belirt; simülasyonu gerçek eğitim gibi gösterme.

## Kod katkısı

- **Backend** katmanlıdır (route → servis → repository); kurallar: [`docs/YEREL_GELISTIRME.md` §8](docs/YEREL_GELISTIRME.md). Veritabanı değişikliği her zaman bir Alembic migration'ı ile yapılır.
- Öğrenci kodu **asla sunucuda çalıştırılmaz.** Bu ilkeyi değiştiren bir PR kabul edilmez.
- Kişisel veri: en az veri, öğrenciden e-posta yok, yeni bir öğretmen erişimi eklersen erişim kaydına yaz.

PR göndermeden önce:

```bash
npm run lint:api && npm run test:api          # backend
cd apps/web && npm run lint && npm run typecheck && npm test   # web
cd apps/web && npx playwright test             # uçtan uca (API açıksa hesap/senkronizasyon testi de koşar)
```

CI her PR'da bunları ve üretim imajlarının duman testini otomatik çalıştırır.

## Lisans

Katkıda bulunarak, koda yaptığın katkıların [MIT](LICENSE), `content/` klasörüne yaptığın katkıların [CC BY 4.0](content/LICENSE.md) lisansıyla yayınlanmasını kabul etmiş olursun.
