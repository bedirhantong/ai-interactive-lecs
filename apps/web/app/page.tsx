import { ArrowRight, BrainCircuit, Code2, FlaskConical, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { MiniLab } from "@/components/landing/mini-lab";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { loadContent } from "@/lib/content/loader";

const STEPS = [
  { icon: FlaskConical, title: "Dene", text: "Kaydırıcılarla, sürüklenebilir noktalarla ve gerçek verilerle oyna. Ne değiştiğini anında gör." },
  { icon: Code2, title: "Kodla", text: "Her deneyin Python karşılığını gör, değiştir ve tarayıcında gerçekten çalıştır." },
  { icon: BrainCircuit, title: "Eğit ve değerlendir", text: "Kendi modelini eğit, test verisiyle ölç, hatalarını incele ve iyileştir." },
];

export default function Landing() {
  const ayran = loadContent().datasets.get("ayran-satislari")!;
  const points = ayran.rows.map((r) => ({ id: r.id, x: Number(r.sicaklik), y: Number(r.ayran) }));
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1">
          <Link href="/yollar" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:text-text sm:block">
            Öğrenme Yolları
          </Link>
          <ThemeToggle />
          <ButtonLink href="/ana-sayfa" size="sm">
            Başla
          </ButtonLink>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1fr_1.15fr] lg:py-16">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-brand">11–18 yaş için yapay zekâ laboratuvarı</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Yapay zekâyı izleyerek değil, <span className="text-brand">deneyerek</span> öğren.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Veriyi incele, modelini eğit, Python ile kodla ve sonuçlarını değerlendir. Hepsi tarayıcında, kayıt olmadan.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/ders/tahmin-modeli-laboratuvari" size="lg">
                Laboratuvara gir <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href="/projeler/akilli-geri-donusum" size="lg" variant="secondary">
                Geri dönüşüm projesi
              </ButtonLink>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-muted">
              <ShieldCheck aria-hidden className="size-4 text-brand" /> Hesap gerekmez. İlerlemen yalnızca bu tarayıcıda saklanır.
            </p>
          </div>
          <MiniLab points={points} />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="text-xs font-bold text-muted">{i + 1}. adım</span>
              </div>
              <h2 className="mt-4 text-lg font-bold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-3xl bg-text p-8 text-surface sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide opacity-70">Öne çıkan proje</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Akıllı Geri Dönüşüm Makinesi</h2>
              <p className="mt-3 opacity-80">
                Atıkları sensör ölçümlerinden tanıyan bir sınıflandırıcı kur. Kâşif modunda kod yazmadan, Yapıcı modunda görsel ve kodu birlikte,
                Geliştirici modunda KNN’i sıfırdan Python ile yaz.
              </p>
            </div>
            <div className="flex lg:justify-end">
              <ButtonLink href="/projeler/akilli-geri-donusum" size="lg" variant="soft">
                Projeyi aç <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        AI Atölye · Demo sürümü ·{" "}
        <Link href="/gizlilik" className="underline">
          Gizlilik
        </Link>
      </footer>
    </div>
  );
}
