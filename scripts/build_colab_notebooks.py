"""Build the Colab Lab notebook templates in content/colab/.

The .ipynb files are generated from this script so they stay reviewable and
reproducible. Standard library only. Run from the repository root:

    python3 scripts/build_colab_notebooks.py

Then verify them by really executing them (needs .venv-notebooks):

    .venv-notebooks/bin/python scripts/verify_colab_notebook.py
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLAB = ROOT / "content" / "colab"


def md(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": textwrap.dedent(text).strip("\n")}


def code(text: str) -> dict:
    return {
        "cell_type": "code",
        "metadata": {},
        "execution_count": None,
        "outputs": [],
        "source": textwrap.dedent(text).strip("\n"),
    }


def write_notebook(name: str, cells: list[dict], colab_title: str) -> Path:
    for i, cell in enumerate(cells):
        cell["id"] = f"c{i:02d}"
        src = cell["source"]
        lines = src.split("\n")
        cell["source"] = [line + "\n" for line in lines[:-1]] + [lines[-1]]
    nb = {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
            "language_info": {"name": "python"},
            "colab": {"name": colab_title, "provenance": []},
            "accelerator": "NONE",
        },
        "cells": cells,
    }
    path = COLAB / name
    path.write_text(json.dumps(nb, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return path


def recycling_notebook() -> None:
    manifest = json.loads((COLAB / "akilli-geri-donusum-colab.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    report_schema = manifest["reportSchemaVersion"]

    cells = [
        md(
            f"""
            # ♻️ Akıllı Geri Dönüşüm Makinesi — Colab Lab

            AI Atölye'de tarayıcında küçük bir KNN modeli eğittin. Şimdi aynı problemi **daha büyük bir veri setiyle** ve **daha güçlü modellerle** çözeceksin.

            **Bu defterde:**
            1. 2000 örneklik, daha gerçekçi (ve daha zor) bir veri seti oluşturacaksın.
            2. KNN, karar ağacı, rastgele orman ve yapay sinir ağı eğiteceksin.
            3. **Doğrulama** verisiyle en iyi modeli seçeceksin.
            4. Seçtiğin modeli **test** verisiyle bir kez değerlendireceksin.
            5. Sonuçlarını bir rapor dosyası olarak AI Atölye'ye geri götüreceksin.

            **Önemli bilgiler**
            - ⏱️ Yaklaşık {manifest["estimatedMinutes"]} dakika sürer.
            - 💻 **GPU gerekmez.** Varsayılan (CPU) çalışma zamanı yeterli.
            - 🔒 Bu defter kişisel bilgi toplamaz. Rapor yalnızca model sonuçlarını içerir.
            - 🧪 Veri **sentetiktir**: bilgisayarla üretilmiştir, gerçek sensör ölçümü değildir.
            - 🖼️ Bu bir **görüntü tanıma** modeli değildir. Modeller fotoğraf görmez; yalnızca sayısal ölçümleri kullanır.

            Hücreleri yukarıdan aşağıya **sırayla** çalıştır: hücreye tıkla ve **Shift + Enter**'a bas.

            _Defter sürümü: {version}_
            """
        ),
        md(
            """
            ## Adım 0 — Ortamı hazırla

            Bu hücre gerekli kütüphaneleri yükler ve sürümlerini yazar. Colab'da hepsi hazır gelir; bir şey kurmana gerek yok.
            """
        ),
        code(
            f"""
            import json, platform, random, sys, time
            from datetime import datetime, timezone

            import numpy as np
            import pandas as pd
            import matplotlib.pyplot as plt
            import sklearn
            from sklearn.model_selection import train_test_split, GridSearchCV
            from sklearn.preprocessing import StandardScaler
            from sklearn.pipeline import make_pipeline
            from sklearn.neighbors import KNeighborsClassifier
            from sklearn.tree import DecisionTreeClassifier
            from sklearn.ensemble import RandomForestClassifier
            from sklearn.neural_network import MLPClassifier
            from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report

            NOTEBOOK_VERSION = "{version}"
            REPORT_SCHEMA_VERSION = "{report_schema}"
            BASLANGIC = time.time()

            try:
                import google.colab  # noqa: F401
                COLAB = True
            except ImportError:
                COLAB = False

            print("Python:", platform.python_version())
            print("scikit-learn:", sklearn.__version__)
            print("Colab'da mı çalışıyor?", "Evet" if COLAB else "Hayır")
            """
        ),
        md(
            """
            ## Adım 1 — Daha gerçekçi bir veri seti oluştur

            Tarayıcıdaki veri seti 160 örnekti ve oldukça "temiz"di. Gerçek bir geri dönüşüm hattı daha karmaşıktır. Bu defterdeki veri seti:

            - **2000 örnek** içerir (her malzemeden 500),
            - iki **zor nesne** ekler: *cips paketi* (içi metal kaplı plastik) ve *karton içecek kutusu* (alüminyum katmanlı kâğıt),
            - sensörleri **daha gürültülü** yapar,
            - nesnelerin **%4'ünü yanlış etiketler** (gerçek veri setlerinde de etiket hataları olur).

            | Ölçüm | Anlamı |
            |---|---|
            | `agirlik_g` | Nesnenin ağırlığı (gram) |
            | `seffaflik` | Işığı ne kadar geçirdiği (0–100) |
            | `esneklik` | Bastırınca ne kadar büküldüğü (0–100) |
            | `iletkenlik` | İletkenlik sensörünün ölçümü (0–100) |

            Bu yüzden hiçbir model %100 başarılı olamaz. Amacımız mükemmel bir sayı değil, **modelleri doğru şekilde karşılaştırmak**.
            """
        ),
        code(
            """
            ALT_TURLER = {
                "plastik": [("Su şişesi", (80, 8), (72, 8), (22, 5)), ("Deterjan şişesi", (25, 10), (52, 10), (60, 12)),
                            ("Yoğurt kabı", (35, 12), (58, 10), (15, 4)), ("Plastik poşet", (55, 15), (88, 5), (5, 2)),
                            ("Cips paketi", (2, 2), (75, 10), (8, 3))],
                "cam": [("Reçel kavanozu", (85, 6), (4, 2), (250, 40)), ("Kahverengi şişe", (40, 10), (3, 2), (300, 50)),
                        ("Yeşil şişe", (50, 10), (3, 2), (320, 50)), ("Su bardağı", (90, 4), (5, 2), (200, 30))],
                "metal": [("İçecek kutusu", (1, 1), (35, 8), (15, 3)), ("Konserve kutusu", (1, 1), (20, 6), (60, 10)),
                          ("Metal kapak", (0.5, 0.5), (25, 8), (5, 2)), ("Alüminyum folyo", (1, 1), (68, 10), (3, 1))],
                "kagit": [("Gazete", (3, 2), (65, 8), (40, 10)), ("Karton kutu", (1, 1), (38, 8), (120, 30)),
                          ("Defter yaprağı", (4, 2), (70, 7), (5, 2)), ("Yumurta kolisi", (1, 1), (30, 8), (70, 15)),
                          ("Karton içecek kutusu", (1, 1), (40, 8), (30, 6))],
            }
            ILETKENLIK = {"plastik": (3, 2), "cam": (2, 1.5), "metal": (85, 8), "kagit": (4, 2)}
            # Boya, metal kaplama ve alüminyum katman iletkenlik ölçümünü değiştirir.
            ILETKENLIK_OZEL = {"Metal kapak": (22, 12), "Cips paketi": (35, 15), "Karton içecek kutusu": (30, 12)}
            GURULTU = 1.8        # sensör gürültüsü çarpanı (1 = tarayıcıdaki veri seti)
            ETIKET_HATASI = 0.04 # yanlış etiketlenmiş nesne oranı

            def sinirla(x, alt=0.0, ust=100.0):
                return max(alt, min(ust, x))

            def veri_uret(adet_sinif_basi=500, tohum=2024, gurultu=GURULTU, etiket_hatasi=ETIKET_HATASI):
                rng = random.Random(tohum)
                olc = lambda ort_sapma: rng.gauss(ort_sapma[0], ort_sapma[1] * gurultu)
                satirlar = []
                for malzeme, turler in ALT_TURLER.items():
                    for i in range(adet_sinif_basi):
                        ad, seff, esn, ag = turler[i % len(turler)]
                        il = ILETKENLIK_OZEL.get(ad, ILETKENLIK[malzeme])
                        satirlar.append({
                            "nesne": ad,
                            "agirlik_g": round(max(1.0, olc(ag)), 1),
                            "seffaflik": round(sinirla(olc(seff)), 1),
                            "esneklik": round(sinirla(olc(esn)), 1),
                            "iletkenlik": round(sinirla(olc(il)), 1),
                            "malzeme": malzeme,
                        })
                for satir in satirlar:  # bazı nesneler yanlış etiketlenmiş
                    if rng.random() < etiket_hatasi:
                        satir["malzeme"] = rng.choice(list(ALT_TURLER))
                rng.shuffle(satirlar)
                return pd.DataFrame(satirlar)

            veri = veri_uret()
            OZELLIKLER = ["agirlik_g", "seffaflik", "esneklik", "iletkenlik"]
            SINIFLAR = ["plastik", "cam", "metal", "kagit"]
            print("Örnek sayısı:", len(veri))
            print(veri["malzeme"].value_counts())
            veri.head()
            """
        ),
        md(
            """
            ### 🔎 Görev: veriyi keşfet

            Aşağıdaki tablo her malzemenin ortalama ölçümlerini, grafik ise şeffaflık–esneklik düzlemini gösteriyor. **Hangi iki malzeme bu grafikte birbirine karışıyor?**
            """
        ),
        code(
            """
            display(veri.groupby("malzeme")[OZELLIKLER].mean().round(1))

            renkler = {"plastik": "#e8590c", "cam": "#1c7ed6", "metal": "#5f3dc4", "kagit": "#2b8a3e"}
            plt.figure(figsize=(6, 4.5))
            for m in SINIFLAR:
                alt = veri[veri["malzeme"] == m]
                plt.scatter(alt["seffaflik"], alt["esneklik"], s=10, alpha=0.6, label=m, color=renkler[m])
            plt.xlabel("Şeffaflık"); plt.ylabel("Esneklik"); plt.legend(); plt.title("Şeffaflık ve esneklik")
            plt.show()
            """
        ),
        md(
            """
            ## Adım 2 — Eğitim, doğrulama ve test

            Veriyi üçe ayırıyoruz:
            - **Eğitim (%60):** Model bunlardan öğrenir.
            - **Doğrulama (%20):** Modelleri ve ayarları **karşılaştırmak** için kullanırız.
            - **Test (%20):** En sonda, seçtiğimiz modeli **yalnızca bir kez** ölçmek için saklarız.

            Neden test verisini modeli seçerken kullanmıyoruz? Çünkü o zaman test verisine göre seçim yapmış oluruz ve sonuç olduğundan iyi görünür.
            """
        ),
        code(
            """
            X = veri[OZELLIKLER].to_numpy()
            y = veri["malzeme"].to_numpy()
            X_gecici, X_test, y_gecici, y_test = train_test_split(X, y, test_size=0.2, random_state=7, stratify=y)
            X_egitim, X_dogrulama, y_egitim, y_dogrulama = train_test_split(X_gecici, y_gecici, test_size=0.25, random_state=7, stratify=y_gecici)
            print(f"Eğitim: {len(X_egitim)}  |  Doğrulama: {len(X_dogrulama)}  |  Test: {len(X_test)}")

            DENEYLER = []
            MODELLER = {}

            def deney_kaydet(kimlik, model, parametreler):
                \"\"\"Modeli eğitir, eğitim ve doğrulama doğruluğunu ölçer, sonucu listeye ekler.\"\"\"
                t0 = time.time()
                model.fit(X_egitim, y_egitim)
                sure = time.time() - t0
                kayit = {
                    "id": kimlik,
                    "algorithm": type(model[-1] if hasattr(model, "steps") else model).__name__,
                    "params": parametreler,
                    "train_accuracy": round(float(accuracy_score(y_egitim, model.predict(X_egitim))), 4),
                    "validation_accuracy": round(float(accuracy_score(y_dogrulama, model.predict(X_dogrulama))), 4),
                    "training_seconds": round(sure, 3),
                }
                DENEYLER[:] = [d for d in DENEYLER if d["id"] != kimlik] + [kayit]
                MODELLER[kimlik] = model
                print(f"{kimlik:22s} eğitim %{kayit['train_accuracy']*100:5.1f}   doğrulama %{kayit['validation_accuracy']*100:5.1f}   ({sure:.2f} sn)")
                return model
            """
        ),
        md(
            """
            ## Adım 3 — Temel model: KNN

            AI Atölye'de kullandığın modelin aynısı. Ölçümleri **ölçekliyoruz** (StandardScaler), çünkü ağırlık (gram) diğer ölçümlerden çok daha büyük sayılar içeriyor.
            """
        ),
        code(
            """
            deney_kaydet("knn", make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=3)), {"n_neighbors": 3, "scaled": True})
            deney_kaydet("knn-olceksiz", KNeighborsClassifier(n_neighbors=3), {"n_neighbors": 3, "scaled": False})
            """
        ),
        md(
            """
            ## Adım 4 — Karar ağacı ve rastgele orman

            **Karar ağacı** veriyi evet/hayır sorularıyla böler. **Rastgele orman** ise yüzlerce küçük ağacı eğitip oylamaya sokar.

            Derin bir ağaçta eğitim doğruluğu ile doğrulama doğruluğu arasındaki farka dikkat et: bu fark **ezberlemenin** (aşırı öğrenme) işaretidir.
            """
        ),
        code(
            """
            deney_kaydet("karar-agaci-3", DecisionTreeClassifier(max_depth=3, random_state=0), {"max_depth": 3})
            deney_kaydet("karar-agaci-derin", DecisionTreeClassifier(max_depth=None, random_state=0), {"max_depth": None})
            deney_kaydet("rastgele-orman", RandomForestClassifier(n_estimators=200, random_state=0), {"n_estimators": 200})
            """
        ),
        md(
            """
            ## Adım 5 — Yapay sinir ağı

            Küçük bir yapay sinir ağı (iki gizli katman: 32 ve 16 nöron) eğitiyoruz. Ağ, veriyi **epok** denen turlar hâlinde tekrar tekrar görür ve her turda hatası (kayıp) azalır.

            Bu gerçek bir eğitimdir: aşağıdaki grafikteki her nokta bir epokta hesaplanan gerçek kayıp değeridir.
            """
        ),
        code(
            """
            sinir_agi = deney_kaydet(
                "sinir-agi",
                make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(32, 16), max_iter=400, random_state=0)),
                {"hidden_layer_sizes": "32,16", "max_iter": 400},
            )
            KAYIP_EGRISI = [round(float(v), 5) for v in sinir_agi[-1].loss_curve_]
            plt.figure(figsize=(6, 3.5))
            plt.plot(KAYIP_EGRISI)
            plt.xlabel("Epok"); plt.ylabel("Kayıp (loss)"); plt.title("Sinir ağının eğitimi")
            plt.show()
            print("Epok sayısı:", len(KAYIP_EGRISI))
            """
        ),
        md(
            """
            ### 🔧 Görev: ayar ara

            Rastgele orman için en iyi ayarı bulmak üzere **çapraz doğrulama** (5 katlı) ile küçük bir arama yapıyoruz. Bu, birkaç düzine modeli arka arkaya eğitir: tarayıcıda yavaş olacak bir iş, Colab'da birkaç saniye sürer.

            İstersen `ayarlar` sözlüğüne kendi değerlerini ekle ve tekrar çalıştır.
            """
        ),
        code(
            """
            ayarlar = {"n_estimators": [50, 200], "max_depth": [3, 6, None]}
            arama = GridSearchCV(RandomForestClassifier(random_state=0), ayarlar, cv=5, n_jobs=-1)
            t0 = time.time()
            arama.fit(X_egitim, y_egitim)
            print(f"{len(arama.cv_results_['params']) * 5} model eğitildi ({time.time() - t0:.1f} sn)")
            print("En iyi ayar:", arama.best_params_)
            deney_kaydet("rastgele-orman-ayarli", RandomForestClassifier(random_state=0, **arama.best_params_), dict(arama.best_params_))
            """
        ),
        md(
            """
            ## Adım 6 — Modelini seç

            Modelleri **doğrulama doğruluğuna** göre karşılaştır. Aşağıdaki hücre en yüksek doğrulama doğruluğuna sahip modeli seçer.

            ✍️ Başka bir modeli seçmek istersen (örneğin daha hızlı ya da daha basit olduğu için), `SECIM` değişkenine o modelin kimliğini yaz: `SECIM = "knn"`
            """
        ),
        code(
            """
            SECIM = None  # kendi seçimin için örnek: SECIM = "sinir-agi"

            tablo = pd.DataFrame(DENEYLER).set_index("id")[["algorithm", "train_accuracy", "validation_accuracy", "training_seconds"]]
            display(tablo.sort_values("validation_accuracy", ascending=False))

            if SECIM is None:
                SECIM = max(DENEYLER, key=lambda d: d["validation_accuracy"])["id"]
            assert SECIM in MODELLER, f"{SECIM} adında bir deney yok"
            print("Seçilen model:", SECIM)
            """
        ),
        md(
            """
            ## Adım 7 — Test verisiyle değerlendir

            Seçtiğin modeli şimdi, hiç görmediği **test** verisiyle ölçüyoruz. Bunu yalnızca bir kez yap: sonucu beğenmeyip modeli değiştirirsen test verisi artık "görülmemiş" sayılmaz.
            """
        ),
        code(
            """
            secilen_model = MODELLER[SECIM]
            tahminler = secilen_model.predict(X_test)
            TEST_DOGRULUK = float(accuracy_score(y_test, tahminler))
            MAKRO_F1 = float(f1_score(y_test, tahminler, average="macro"))
            KARISIKLIK = confusion_matrix(y_test, tahminler, labels=SINIFLAR)
            RAPOR = classification_report(y_test, tahminler, labels=SINIFLAR, output_dict=True, zero_division=0)

            print(f"Test doğruluğu: %{TEST_DOGRULUK*100:.1f}   Makro F1: {MAKRO_F1:.3f}")
            print(classification_report(y_test, tahminler, labels=SINIFLAR, zero_division=0))
            plt.figure(figsize=(4.5, 4))
            plt.imshow(KARISIKLIK, cmap="Greens")
            plt.xticks(range(4), SINIFLAR); plt.yticks(range(4), SINIFLAR)
            plt.xlabel("Tahmin"); plt.ylabel("Gerçek")
            for i in range(4):
                for j in range(4):
                    plt.text(j, i, KARISIKLIK[i, j], ha="center", va="center")
            plt.title("Karışıklık matrisi")
            plt.show()
            """
        ),
        md(
            """
            ## Adım 8 — Raporu AI Atölye'ye götür

            Son hücre, sonuçlarını **ai-atolye-rapor.json** adlı bir dosyaya yazar ve indirir. Dosya yalnızca model sonuçlarını içerir; adını ya da e-postanı içermez.

            İndirme başlamazsa: soldaki 📁 **Dosyalar** panelinden `ai-atolye-rapor.json` dosyasına sağ tıklayıp **İndir**'i seç.
            """
        ),
        code(
            """
            def sayi(v):
                return v if isinstance(v, (int, float, str, bool)) or v is None else str(v)

            rapor = {
                "schema_version": REPORT_SCHEMA_VERSION,
                "project_id": "akilli-geri-donusum",
                "template_id": "akilli-geri-donusum-colab",
                "notebook_version": NOTEBOOK_VERSION,
                "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "environment": {
                    "python": platform.python_version(),
                    "sklearn": sklearn.__version__,
                    "accelerator": "none",
                    "colab": COLAB,
                    "runtime_seconds": round(time.time() - BASLANGIC, 1),
                },
                "dataset": {
                    "name": "geri-donusum-gercekci-2000",
                    "synthetic": True,
                    "n_train": int(len(X_egitim)),
                    "n_validation": int(len(X_dogrulama)),
                    "n_test": int(len(X_test)),
                    "features": OZELLIKLER,
                    "classes": SINIFLAR,
                },
                "experiments": [{**d, "params": {k: sayi(v) for k, v in d["params"].items()}} for d in DENEYLER],
                "selected_experiment": SECIM,
                "test_metrics": {
                    "accuracy": round(TEST_DOGRULUK, 4),
                    "macro_f1": round(MAKRO_F1, 4),
                    "labels": SINIFLAR,
                    "confusion_matrix": KARISIKLIK.astype(int).tolist(),
                    "per_class": {
                        s: {"precision": round(RAPOR[s]["precision"], 4), "recall": round(RAPOR[s]["recall"], 4),
                            "f1": round(RAPOR[s]["f1-score"], 4), "support": int(RAPOR[s]["support"])}
                        for s in SINIFLAR
                    },
                },
                "loss_curve": KAYIP_EGRISI,
                "completed": True,
            }

            with open("ai-atolye-rapor.json", "w", encoding="utf-8") as f:
                json.dump(rapor, f, ensure_ascii=False, indent=1)
            print("Rapor yazıldı: ai-atolye-rapor.json")

            if COLAB:
                from google.colab import files
                files.download("ai-atolye-rapor.json")
            """
        ),
        md(
            """
            ## ✅ Bitti! Şimdi AI Atölye'ye dön

            1. AI Atölye'deki projeye geri dön.
            2. **Colab raporunu içe aktar** bölümünden `ai-atolye-rapor.json` dosyasını seç.
            3. Sonuçlarını tarayıcıdaki modelinle karşılaştır ve yansıtma sorularını cevapla.

            **İsteğe bağlı ek görevler**
            - `veri_uret(adet_sinif_basi=50)` ile veriyi küçült: modeller nasıl etkileniyor?
            - `veri_uret(gurultu=1.0, etiket_hatasi=0.0)` ile tarayıcıdaki kadar temiz bir veriyle dene. Fark ne?
            - `OZELLIKLER` listesinden `iletkenlik`'i çıkar ve tüm defteri tekrar çalıştır.
            - Sinir ağında `hidden_layer_sizes=(4,)` gibi çok küçük bir ağ dene.
            """
        ),
    ]
    path = write_notebook(manifest["notebookFile"], cells, manifest["title"])
    print("wrote", path.relative_to(ROOT))


if __name__ == "__main__":
    recycling_notebook()
