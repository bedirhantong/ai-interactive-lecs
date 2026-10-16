"use client";

import { CheckCircle2, Clock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { LabBadges } from "@/components/notebook/lab-badges";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { LessonSummary } from "@/lib/content/loader";
import { LEVEL_LABELS } from "@/lib/content/schema";
import { useProgressHydrated } from "@/lib/progress/hydration";
import { type LessonProgress, useProgress } from "@/lib/progress/store";
import { cn } from "@/lib/cn";

export function lessonState(progress: LessonProgress | undefined, total: number) {
  if (!progress) return { label: "Başlanmadı", value: 0, status: "new" as const };
  if (progress.completedAt) return { label: "Tamamlandı", value: 1, status: "done" as const };
  const done = progress.completedRequired.length;
  return { label: `${done}/${total} görev`, value: total ? done / total : 0, status: "started" as const };
}

export function LessonStatusBadge({ lessonId, total }: { lessonId: string; total: number }) {
  const hydrated = useProgressHydrated();
  const progress = useProgress((s) => s.lessons[lessonId]);
  if (!hydrated) return null;
  const st = lessonState(progress, total);
  return (
    <Badge tone={st.status === "done" ? "success" : st.status === "started" ? "brand" : "neutral"}>
      {st.status === "done" && <CheckCircle2 aria-hidden className="size-3.5" />}
      {st.label}
    </Badge>
  );
}

export function LessonCard({ lesson, className }: { lesson: LessonSummary; className?: string }) {
  const hydrated = useProgressHydrated();
  const progress = useProgress((s) => s.lessons[lesson.id]);
  const st = lessonState(hydrated ? progress : undefined, lesson.requiredCellIds.length);
  return (
    <Link
      href={`/ders/${lesson.id}`}
      className={cn("group flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-border-strong", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{LEVEL_LABELS[lesson.level]}</Badge>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <Clock aria-hidden className="size-3.5" /> ~{lesson.estimatedMinutes} dk
        </span>
        {hydrated && <LessonStatusBadge lessonId={lesson.id} total={lesson.requiredCellIds.length} />}
      </div>
      <h3 className="mt-3 text-lg font-bold leading-snug group-hover:text-brand">{lesson.title}</h3>
      <p className="mt-1 flex-1 text-sm text-muted">{lesson.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <LabBadges labs={lesson.labs} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <ProgressBar value={st.value} label={`${lesson.title} ilerlemesi`} />
        <PlayCircle aria-hidden className="size-5 shrink-0 text-brand" />
      </div>
    </Link>
  );
}
