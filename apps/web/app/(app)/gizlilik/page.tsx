import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gizlilik" };

export default function PrivacyPage() {
  return (
    <article className="prose-atolye max-w-3xl">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">Gizlilik bilgisi</h1>
      <p className="rounded-xl bg-warning-soft p-3 text-sm">
        Bu metin demo sürümü için hazırlanmış bir bilgilendirmedir. Okullarda kullanım öncesinde KVKK ve reşit olmayanların verilerine ilişkin kurallar
        açısından hukuki inceleme yapılması gerekir.
      </p>
      <h2>Demo modunda ne saklanır?</h2>
      <ul>
        <li>Defterlerindeki kodlar, deney ayarların, eğittiğin modellerin sonuçları ve yazdığın cevaplar.</li>
        <li>İsteğe bağlı olarak verdiğin takma ad, seviye ve yaş aralığı (doğum tarihi sorulmaz).</li>
      </ul>
      <p>
        Bunların hepsi <strong>yalnızca bu tarayıcıda</strong> (localStorage) saklanır. Hiçbir sunucuya gönderilmez, kimseyle paylaşılmaz. Profil
        sayfasından indirebilir ya da tamamen silebilirsin.
      </p>
      <h2>Python kodun nerede çalışır?</h2>
      <p>
        Kodun senin tarayıcında, ayrı bir çalışma alanında (Web Worker, Pyodide) çalışır. Python ortamı ilk açılışta bir içerik dağıtım ağından
        (cdn.jsdelivr.net) indirilir; bu sırada tarayıcın o sunucuya standart bir istek gönderir.
      </p>
      <h2>Neler yapılmaz?</h2>
      <ul>
        <li>Reklam yoktur, davranışsal profil çıkarılmaz, üçüncü taraf takip araçları kullanılmaz.</li>
        <li>Herkese açık sıralama tablosu ya da öğrenciler arası mesajlaşma yoktur.</li>
        <li>Projelerin varsayılan olarak gizlidir.</li>
        <li>Kamera, mikrofon ya da dosya yükleme bu sürümde kullanılmaz.</li>
      </ul>
      <h2>Yapay zekâ asistanı</h2>
      <p>
        Bu sürümdeki ipuçları ve hata açıklamaları ders ekibi tarafından yazılmıştır. Canlı bir yapay zekâ servisine veri gönderilmez.
      </p>
    </article>
  );
}
