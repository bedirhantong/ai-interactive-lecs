import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NotebookRoot } from "@/components/notebook/notebook-root";
import { colabTemplatesForLesson, datasetsForLesson, loadContent } from "@/lib/content/loader";
import { lessonNav } from "@/lib/content/navigation";

export function generateStaticParams() {
  return [...loadContent().lessons.keys()].map((lessonId) => ({ lessonId }));
}

export async function generateMetadata({ params }: PageProps<"/ders/[lessonId]">): Promise<Metadata> {
  const { lessonId } = await params;
  const lesson = loadContent().lessons.get(lessonId);
  return { title: lesson?.title ?? "Ders bulunamadı", description: lesson?.summary };
}

async function Lesson({ params }: { params: PageProps<"/ders/[lessonId]">["params"] }) {
  const { lessonId } = await params;
  const lesson = loadContent().lessons.get(lessonId);
  if (!lesson) notFound();
  return (
    <NotebookRoot
      lesson={lesson}
      datasets={datasetsForLesson(lesson)}
      colabTemplates={colabTemplatesForLesson(lesson)}
      nav={lessonNav(lesson.id)}
    />
  );
}

export default function LessonPage({ params }: PageProps<"/ders/[lessonId]">) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-muted">Defter hazırlanıyor…</div>}>
      <Lesson params={params} />
    </Suspense>
  );
}
