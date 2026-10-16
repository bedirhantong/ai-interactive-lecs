# Güvenlik politikası

AI Atölye çocuklara yönelik bir eğitim platformu; güvenlik ve gizlilik açıklarını ciddiye alıyoruz.

## Açık bildirme

**Lütfen güvenlik açıklarını herkese açık issue olarak bildirme.** Bunun yerine GitHub'ın gizli bildirim özelliğini kullan:

**Repository → Security → Report a vulnerability**

Bildiriminde şunlar olursa çok yardımcı olur: etkilenen bileşen (web, API, Colab şablonu), adım adım yeniden üretme, olası etki. En geç 7 gün içinde dönüş yapmaya çalışırız.

Özellikle önemsediğimiz konular:
- Bir öğrencinin başka bir öğrencinin ya da bir öğretmenin yetkisi dışındaki bir sınıfın verisine erişebilmesi
- Oturum, CSRF ya da giriş sınırlamasının aşılması
- Tarayıcıdaki Python ortamından (Pyodide) uygulama verisine/oturuma erişim
- Colab raporu içe aktarma yoluyla kod çalıştırma ya da veri sızdırma

## Desteklenen sürümler

Yalnızca `main` dalındaki son sürüm desteklenir.

## Bilinen sınırlar

Tasarım gereği bilinen sınırlar (ör. tarayıcıda hesaplanan ilerlemenin öz bildirim olması) [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ve [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md) içinde belgelenmiştir.
