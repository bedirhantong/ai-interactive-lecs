import { Clock, FolderKanban, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LessonStatusBadge } from "@/components/student/lesson-status";
import { Badge } from "@/components/ui/badge";
import { getCatalog } from "@/lib/content/catalog";
import { LEVEL_LABELS } from "@/lib/content/schema";

export function generateStaticParams() {
  return getCatalog().paths.map((p) => ({ pathId: p.id }));
}

export async function generateMetadata({ params }: PageProps<"/yollar/[pathId]">): Promise<Metadata> {
  const { pathId } = await params;
  return { title: getCatalog().paths.find((p) => p.id === pathId)?.title ?? "Yol bulunamadı" };
}

async function PathDetail({ params }: { params: PageProps<"/yollar/[pathId]">["params"] }) {
  const { pathId } = await params;
  const catalog = getCatalog();
  const path = catalog.paths.find((p) => p.id === pathId);
  if (!path) notFound();

  return (
    <div className="space-y-8">
      <header>
        <Link href="/yollar" className="text-sm font-semibold text-muted hover:text-text">
          ← Öğrenme Yolları
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{path.title}</h1>
        <p className="mt-2 max-w-2xl text-muted">{path.description}</p>
      </header>
      {path.modules.map((module, mi) => (
        <section key={module.id} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">Modül {mi + 1}</div>
          <h2 className="text-xl font-bold">{module.title}</h2>
          <p className="mt-1 text-sm text-muted">{module.description}</p>
          <ol className="mt-4 space-y-2">
            {module.items.map((item, i) => {
              if (item.kind === "planned") {
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-muted">
                    <Lock aria-hidden className="size-4 shrink-0" />
                    <span className="flex-1">{item.title}</span>
                    <Badge>Hazırlanıyor</Badge>
                  </li>
                );
              }
              if (item.kind === "project") {
                const project = catalog.projects[item.projectId];
                return (
                  <li key={i}>
                    <Link href={`/projeler/${project.id}`} className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 hover:border-accent">
                      <FolderKanban aria-hidden className="size-5 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Proje: {project.title}</span>
                        <span className="block text-sm text-muted">{project.tagline}</span>
                      </span>
                      <Badge tone="accent">3 seviye</Badge>
                    </Link>
                  </li>
                );
              }
              const lesson = catalog.lessons[item.lessonId];
              return (
                <li key={i}>
                  <Link href={`/ders/${lesson.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3 hover:border-border-strong">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{lesson.title}</span>
                      <span className="block text-sm text-muted">{lesson.summary}</span>
                    </span>
                    <Badge tone="brand">{LEVEL_LABELS[lesson.level]}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Clock aria-hidden className="size-3.5" />~{lesson.estimatedMinutes} dk
                    </span>
                    <LessonStatusBadge lessonId={lesson.id} total={lesson.requiredCellIds.length} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

export default function PathPage({ params }: PageProps<"/yollar/[pathId]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <PathDetail params={params} />
    </Suspense>
  );
}
