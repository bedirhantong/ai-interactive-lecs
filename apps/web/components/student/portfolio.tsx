"use client";

import { Download, FolderKanban, Lock } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import type { Catalog } from "@/lib/content/catalog";
import { LEVEL_LABELS, type Lesson } from "@/lib/content/schema";
import { toIpynb } from "@/lib/notebook/ipynb";
import type { SavedNotebook } from "@/lib/notebook/types";
import { useProgressHydrated } from "@/lib/progress/hydration";
import { useProgress } from "@/lib/progress/store";
import { notebookKey, readJson } from "@/lib/storage";
import { downloadJson } from "./download";

export function Portfolio({ catalog, lessons }: { catalog: Catalog; lessons: Record<string, Lesson> }) {
  const hydrated = useProgressHydrated();
  const portfolio = useProgress((s) => s.portfolio);
  const progress = useProgress((s) => s.lessons);
  if (!hydrated) return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />;

  const entries = Object.values(portfolio).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const inProgress = Object.values(catalog.projects).flatMap((p) =>
    Object.values(p.modes).filter((id) => progress[id] && !progress[id].completedAt).map((id) => ({ project: p, lessonId: id })),
  );
  const skillTitle = (id: string) => catalog.skills.find((s) => s.id === id)?.title ?? id;

  const exportNotebook = (lessonId: string) => {
    const lesson = lessons[lessonId];
    if (!lesson) return;
    downloadJson(`${lessonId}.ipynb`, toIpynb(lesson, readJson<SavedNotebook>(notebookKey(lessonId))));
  };

  return (
    <div className="space-y-8">
      <p className="flex items-center gap-2 text-sm text-muted">
        <Lock aria-hidden className="size-4" /> Projelerin gizlidir. Kimse göremez; yalnızca bu tarayıcıda saklanır.
      </p>
      {entries.length === 0 && inProgress.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border-strong p-10 text-center">
          <FolderKanban aria-hidden className="mx-auto size-10 text-muted" />
          <p className="mt-3 font-semibold">Henüz bir projen yok</p>
          <p className="mt-1 text-sm text-muted">Bir projeyi tamamladığında, sonuçların ve yansıtma yazınla birlikte burada görünür.</p>
          <ButtonLink href="/projeler/akilli-geri-donusum" className="mt-4">
            Akıllı Geri Dönüşüm Makinesi’ne başla
          </ButtonLink>
        </div>
      )}
      {entries.map((e) => {
        const project = catalog.projects[e.projectId];
        return (
          <article key={`${e.projectId}:${e.lessonId}`} className="rounded-2xl border border-border bg-surface p-6 shadow-card" data-testid="portfolio-entry">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{project.title}</h2>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge tone="brand">{LEVEL_LABELS[e.level]}</Badge>
                  <Badge tone="success">Tamamlandı · {new Date(e.completedAt).toLocaleDateString("tr-TR")}</Badge>
                  <Badge>Gizli</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => exportNotebook(e.lessonId)}>
                  <Download aria-hidden className="size-3.5" /> .ipynb indir
                </Button>
                <ButtonLink href={`/ders/${e.lessonId}`} variant="ghost" size="sm">
                  Deftere git
                </ButtonLink>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">{project.objective}</p>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-muted">En iyi test doğruluğu</dt>
                <dd className="font-mono text-2xl font-bold">{e.bestTestAccuracy === null ? "—" : `%${(e.bestTestAccuracy * 100).toFixed(1)}`}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">Kullanılan özellikler</dt>
                <dd className="text-sm">{e.bestFeatures.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted">Deney sayısı</dt>
                <dd className="font-mono text-2xl font-bold">{e.experiments}</dd>
              </div>
            </dl>
            {e.colab && (
              <div className="mt-4 rounded-xl border border-border p-3 text-sm" data-testid="portfolio-colab">
                <div className="text-xs font-semibold text-muted">Colab Lab sonucu (öz bildirim, doğrulanmadı)</div>
                <div className="mt-0.5">
                  {e.colab.algorithm}: test doğruluğu <strong className="font-mono">%{(e.colab.testAccuracy * 100).toFixed(1)}</strong> ·{" "}
                  {e.colab.nTrain} eğitim / {e.colab.nTest} test örneği
                </div>
              </div>
            )}
            {e.reflection && (
              <blockquote className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
                <div className="mb-1 text-xs font-semibold text-muted">Yansıtma</div>
                {e.reflection}
              </blockquote>
            )}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {e.skills.map((s) => (
                <Badge key={s}>{skillTitle(s)}</Badge>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-subtle">Sonuçlar senin tarayıcında hesaplandı (öz bildirim). Veri seti sentetiktir.</p>
          </article>
        );
      })}
      {inProgress.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Devam eden</h2>
          <ul className="space-y-2">
            {inProgress.map(({ project, lessonId }) => (
              <li key={lessonId}>
                <Link href={`/ders/${lessonId}`} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong">
                  <span className="font-semibold">
                    {project.title} · {LEVEL_LABELS[catalog.lessons[lessonId].level]}
                  </span>
                  <span className="text-sm text-muted">
                    {progress[lessonId].completedRequired.length}/{catalog.lessons[lessonId].requiredCellIds.length} görev
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
