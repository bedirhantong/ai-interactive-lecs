import { AlertTriangle, CheckCircle2, Target } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Markdown } from "@/components/notebook/markdown";
import { LessonCard } from "@/components/student/lesson-status";
import { Callout } from "@/components/ui/callout";
import { getCatalog } from "@/lib/content/catalog";
import { loadContent } from "@/lib/content/loader";
import { LEVELS, LEVEL_DESCRIPTIONS, LEVEL_LABELS } from "@/lib/content/schema";

export function generateStaticParams() {
  return Object.keys(getCatalog().projects).map((projectId) => ({ projectId }));
}

export async function generateMetadata({ params }: PageProps<"/projeler/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  return { title: getCatalog().projects[projectId]?.title ?? "Proje bulunamadı" };
}

async function ProjectDetail({ params }: { params: PageProps<"/projeler/[projectId]">["params"] }) {
  const { projectId } = await params;
  const catalog = getCatalog();
  const project = catalog.projects[projectId];
  if (!project) notFound();
  const dataset = loadContent().datasets.get(project.datasetId)!;

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <div className="text-xs font-bold uppercase tracking-wide text-accent">Proje</div>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{project.title}</h1>
        <p className="mt-2 text-lg text-muted">{project.tagline}</p>
      </header>
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <h2 className="mb-2 font-bold">Problem</h2>
          <Markdown>{project.problem}</Markdown>
          <h2 className="mb-2 mt-5 flex items-center gap-2 font-bold">
            <Target aria-hidden className="size-4 text-brand" /> Hedef
          </h2>
          <p>{project.objective}</p>
          <p className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">
            <strong>Başlamadan önce bir hipotez kur:</strong> {project.hypothesisPrompt}
          </p>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <h2 className="mb-2 font-bold">Tamamlama ölçütleri</h2>
            <ul className="space-y-1.5 text-sm">
              {project.completionCriteria.map((c) => (
                <li key={c} className="flex gap-2">
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <Callout tone="data" title="Sınırlamalar">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {project.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Veri seti: {dataset.title} ({dataset.rows.length} örnek, sentetik).</p>
          </Callout>
        </div>
      </section>
      <section>
        <h2 className="text-xl font-bold">Seviyeni seç</h2>
        <p className="mt-1 text-sm text-muted">Üç seviyenin öğrenme hedefi aynı; sadece araçlar farklı. İstediğin zaman başka bir seviyeyi de deneyebilirsin.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {LEVELS.map((level) => (
            <div key={level} className="flex flex-col">
              <div className="mb-2 px-1">
                <div className="font-bold">{LEVEL_LABELS[level]}</div>
                <p className="text-xs text-muted">{LEVEL_DESCRIPTIONS[level]}</p>
              </div>
              <LessonCard lesson={catalog.lessons[project.modes[level]]} className="flex-1" />
            </div>
          ))}
        </div>
      </section>
      <p className="flex items-center gap-2 text-xs text-muted">
        <AlertTriangle aria-hidden className="size-3.5" /> Bu proje görüntü tanıma yapmaz; model yalnızca sayısal sensör ölçümleriyle çalışır.
      </p>
    </div>
  );
}

export default function ProjectPage({ params }: PageProps<"/projeler/[projectId]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <ProjectDetail params={params} />
    </Suspense>
  );
}
