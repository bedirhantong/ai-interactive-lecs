/**
 * Authored (deterministic) explanations for common Python errors, in Turkish.
 * This is not an AI: it matches the error type and message against rules
 * written by the content team, and says so in the UI.
 */
import type { RunError } from "@/lib/runtime/protocol";

export interface ErrorExplanation {
  title: string;
  explanation: string;
  question: string;
}

interface Rule {
  match: (e: RunError, code: string) => boolean;
  explain: (e: RunError, code: string) => ErrorExplanation;
}

const quoted = (msg: string) => msg.match(/'([^']+)'/)?.[1];

const rules: Rule[] = [
  {
    match: (e) => e.type === "Zaman aşımı",
    explain: () => ({
      title: "Kod durmadan çalışıyordu",
      explanation:
        "Kodun belirlenen süreden uzun sürdüğü için durduruldu. En sık nedeni, koşulu hiç yanlış olmayan bir `while` döngüsüdür.",
      question: "Döngünün her turunda, döngüyü bitirecek değişken gerçekten değişiyor mu?",
    }),
  },
  {
    match: (e) => e.type === "ModuleNotFoundError",
    explain: (e) => ({
      title: "Bu paket bulunamadı",
      explanation: `\`${quoted(e.message) ?? "Bu paket"}\` bu tarayıcıdaki Python ortamında yok. Tarayıcıda çalışan Python her paketi desteklemez; numpy, pandas ve scikit-learn gibi yaygın paketler kullanılabilir.`,
      question: "Paket adını doğru yazdın mı? Bu iş için standart kütüphane (math, csv, random) yeterli olabilir mi?",
    }),
  },
  {
    match: (e, code) => (e.type === "OSError" || e.type === "EOFError") && code.includes("input("),
    explain: () => ({
      title: "input() burada çalışmaz",
      explanation:
        "Bu defterde kod hücreleri klavyeden veri okuyamaz. Değeri doğrudan bir değişkene yazarak deneyebilirsin: `yas = 13`.",
      question: "input() yerine hangi değeri bir değişkene yazabilirsin?",
    }),
  },
  {
    match: (e) => e.type === "NameError",
    explain: (e) => {
      const name = quoted(e.message);
      return {
        title: "Tanımlanmamış bir isim",
        explanation: `Python \`${name ?? "bu ismi"}\` adında bir değişken ya da fonksiyon bulamadı. Ya yazımı farklı, ya da onu tanımlayan hücre henüz çalıştırılmadı (Python ortamı yeniden başlatıldıysa önceki hücreleri tekrar çalıştırman gerekir).`,
        question: `\`${name ?? "Bu isim"}\` nerede tanımlanıyor? O hücreyi bu oturumda çalıştırdın mı?`,
      };
    },
  },
  {
    match: (e) => e.type === "IndentationError" || e.type === "TabError",
    explain: () => ({
      title: "Girinti hatası",
      explanation:
        "Python, satırların başındaki boşluklara bakarak hangi satırın hangi bloğa (if, for, def) ait olduğunu anlar. Aynı bloktaki satırlar aynı sayıda boşlukla başlamalı; genelde 4 boşluk kullanılır.",
      question: "Hatalı satır, üstündeki `if`, `for` ya da `def` satırına göre içeride mi?",
    }),
  },
  {
    match: (e) => e.type === "SyntaxError",
    explain: (e) => ({
      title: "Yazım (sözdizimi) hatası",
      explanation: `Python bu satırı anlayamadı${e.line ? ` (satır ${e.line})` : ""}. Sık nedenler: kapanmamış parantez ya da tırnak, \`if\`/\`for\`/\`def\` satırının sonunda unutulan iki nokta (\`:\`), karşılaştırmada \`=\` yerine \`==\` kullanmamak.`,
      question: "Satırdaki parantezleri ve tırnakları tek tek sayabilir misin? Her açılan kapanıyor mu?",
    }),
  },
  {
    match: (e) => e.type === "TypeError" && /unsupported operand|can only concatenate|must be str/.test(e.message),
    explain: () => ({
      title: "Uyumsuz türler",
      explanation:
        "Farklı türdeki değerleri birleştirmeye çalıştın, örneğin bir metinle bir sayıyı toplamak gibi. `\"5\" + 3` çalışmaz; `int(\"5\") + 3` ya da `\"5\" + str(3)` çalışır.",
      question: "İşlemdeki değerlerin her biri sayı mı, metin mi? `type(x)` ile kontrol edebilirsin.",
    }),
  },
  {
    match: (e) => e.type === "TypeError" && /NoneType/.test(e.message),
    explain: () => ({
      title: "Bir değer None çıktı",
      explanation:
        "Bir değişkenin değeri `None` (boş). Çoğu zaman sebebi, `return` satırı olmayan bir fonksiyonun sonucunu kullanmaktır. `print` sonucu göstermekle kalır, geri döndürmez.",
      question: "Kullandığın fonksiyon bir değer `return` ediyor mu?",
    }),
  },
  {
    match: (e) => e.type === "TypeError" && /argument/.test(e.message),
    explain: () => ({
      title: "Argüman sayısı uyuşmuyor",
      explanation: "Fonksiyonu, tanımında beklediğinden farklı sayıda değerle çağırdın.",
      question: "`def` satırında kaç parametre var, çağırırken kaç değer veriyorsun?",
    }),
  },
  {
    match: (e) => e.type === "IndexError",
    explain: () => ({
      title: "Listenin dışına çıktın",
      explanation:
        "Listede olmayan bir sıradaki elemana ulaşmaya çalıştın. Python'da sayma 0'dan başlar: 3 elemanlı bir listenin son elemanı `liste[2]`'dir.",
      question: "Listenin uzunluğu `len(liste)` kaç? Hangi sıra numarasını istedin?",
    }),
  },
  {
    match: (e) => e.type === "KeyError",
    explain: (e) => ({
      title: "Sözlükte olmayan anahtar",
      explanation: `Sözlükte ${e.message || "bu"} anahtarı yok. Yazımı (büyük/küçük harf, Türkçe karakter) kontrol et.`,
      question: "Sözlükteki anahtarları görmek için `print(sozluk.keys())` dener misin?",
    }),
  },
  {
    match: (e) => e.type === "ZeroDivisionError",
    explain: () => ({
      title: "Sıfıra bölme",
      explanation: "Bir sayıyı sıfıra böldün. Örneğin boş bir listenin ortalamasını almaya çalışırken `len(liste)` sıfır olabilir.",
      question: "Bölen değişken hangi durumda sıfır oluyor?",
    }),
  },
  {
    match: (e) => e.type === "ValueError",
    explain: () => ({
      title: "Uygun olmayan değer",
      explanation:
        "Değerin türü doğru ama içeriği uygun değil. Örneğin `int(\"on iki\")` ya da `float(\"\")` bu hatayı verir.",
      question: "Dönüştürmeye çalıştığın değeri `print` ile yazdırıp bakabilir misin?",
    }),
  },
  {
    match: (e) => e.type === "AttributeError",
    explain: () => ({
      title: "Böyle bir özellik ya da metot yok",
      explanation: "Bu türdeki bir değer, kullandığın metodu desteklemiyor. Örneğin listelerde `.append` vardır ama `.add` yoktur.",
      question: "Değişkenin türü ne? Doğru metot adını kullandın mı?",
    }),
  },
  {
    match: (e) => e.type === "RecursionError",
    explain: () => ({
      title: "Fonksiyon kendini durmadan çağırıyor",
      explanation: "Bir fonksiyon kendini çağırıyor ama durma koşuluna hiç ulaşmıyor.",
      question: "Fonksiyonun kendini çağırmayı bıraktığı durum hangisi?",
    }),
  },
];

export function explainError(error: RunError, code = ""): ErrorExplanation {
  const rule = rules.find((r) => r.match(error, code));
  if (rule) return rule.explain(error, code);
  return {
    title: `${error.type} hatası`,
    explanation: "Bu hata için hazırlanmış bir açıklama yok. Hata mesajının son satırını dikkatle oku: genelde sorunun ne olduğunu söyler.",
    question: "Hata hangi satırda oluştu? O satırdaki değişkenlerin değerlerini yazdırmayı dener misin?",
  };
}
