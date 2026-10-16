# KVKK notları (hukuki inceleme için)

> Bu belge teknik olarak neyin yapıldığını özetler; **hukuki görüş değildir.** Gerçek öğrencilerle kullanıma başlamadan önce bir KVKK uzmanı/avukat ve okul yönetimiyle birlikte gözden geçirilmelidir.

## Teknik olarak hazır olanlar

| İlke / hak | Uygulama |
|---|---|
| **Veri minimizasyonu** | Öğrenciden e-posta, doğum tarihi, telefon, fotoğraf alınmaz. Görünen ad (önerilen: ad + soyadın baş harfi), öğretmenin verdiği kullanıcı adı ve isteğe bağlı yaş aralığı (11-13 / 14-15 / 16-18) dışında kimlik bilgisi yoktur. |
| **Güvenlik** | Şifreler geri döndürülemez özet (scrypt) olarak saklanır; oturum anahtarları yalnızca özet olarak saklanır; giriş denemeleri ve IP adresleri anahtarlı özet (HMAC) olarak saklanır ve 7 gün sonra silinir. Kaba kuvvet koruması, CSRF koruması, güvenlik başlıkları vardır. |
| **Bilgi edinme / erişim hakkı (md. 11)** | `GET /me/export`: kişiye ait tüm veriler tek bir makinece okunabilir belgede. |
| **Düzeltme hakkı** | `PATCH /me`: görünen ad ve yaş aralığı. |
| **Silme hakkı** | `POST /me/delete`: hesap ve bağlı tüm veriler kalıcı silinir (veritabanı düzeyinde zincirleme silme; testlerle doğrulanır). Öğretmen, oluşturduğu öğrenci hesabını silebilir. |
| **Hesap verebilirlik** | Öğretmenin öğrenci verisine erişimi ve hesap üzerindeki işlemler erişim kaydına yazılır; kişi kendi kaydını `GET /me/access-log` ile görür. |
| **Saklama süreleri** | Oturumlar: süresi dolunca + 1 gün. Giriş denemeleri: 7 gün. Demo hesapları: 1 gün. Erişim kayıtları: 365 gün (ayarlanabilir). Uzun süre kullanılmayan öğrenci hesapları: **varsayılan kapalı**, okul karar verince açılır. |
| **Erişim sınırları** | Öğretmen yalnızca kendi sınıfındaki ve onayladığı öğrencilerin verisini görür; öğrenciler birbirinin verisini göremez; projeler varsayılan olarak gizlidir. |
| **Üçüncü taraflar** | Reklam, analitik ya da takip aracı yoktur. Öğrenci kodu sunucuda çalıştırılmaz. Python ortamı ve kod editörü bir CDN'den (jsDelivr) indirilir; Colab defterleri öğrencinin kendi Google hesabında açılır. |

## Karar ya da hukuki inceleme gerektirenler

1. **Veri sorumlusu kim?** Okul (MEB'e bağlı kurum) mu, platformu işleten taraf mı? Platformun "veri işleyen" sıfatı ve aradaki sözleşme.
2. **Hukuki dayanak ve aydınlatma metni.** Öğrencilere ve velilere gösterilecek aydınlatma metni; 18 yaş altı için veli onayı gerekip gerekmediği ve nasıl alınacağı. (Platform tek bir yaş eşiğiyle otomatik karar vermez.)
3. **Saklama süreleri.** Erişim kayıtlarının 365 gün, kullanılmayan öğrenci hesaplarının silinme süresi (şu an kapalı). Okul politikasıyla uyumlu olmalı.
4. **Yurt dışına aktarım.** Barındırma (hosting) ve yedekleme hizmetinin konumu; CDN (jsDelivr) ve Google Colab kullanımının değerlendirilmesi.
5. **İlgili kişi başvuruları.** Veli adına yapılan başvurular, kimlik doğrulama süreci ve 30 günlük cevap süresi için operasyonel süreç.
6. **Veri ihlali bildirimi.** Kurula ve ilgili kişilere bildirim prosedürü (teknik loglar: istek kimliği, erişim kayıtları mevcut).
7. **VERBİS** kaydı yükümlülüğünün değerlendirilmesi.
8. **Öğretmenin öğrenci hesabı silmesi.** Silme yetkisinin öğretmende mi yoksa yalnızca okul yöneticisinde mi olacağı.

## Bilinen teknik sınırlar

- Yedeklerden silme: veritabanı yedekleri (henüz yapılandırılmadı) silinen veriyi yedek saklama süresi boyunca içerebilir; yedekleme politikası belirlenmeli.
- Tarayıcıda (demo modunda) saklanan veriler sunucuda değildir; kullanıcı Profil sayfasından indirip silebilir.
- Uygulama logları kişisel veri içermeyecek şekilde tasarlanmıştır (istek gövdeleri loglanmaz); log saklama süresi barındırma ortamında ayarlanmalıdır.
