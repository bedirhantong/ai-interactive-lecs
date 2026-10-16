import type { Metadata } from "next";
import { LessonCard } from "@/components/student/lesson-status";
import { getCatalog } from "@/lib/content/catalog";
import { LEVELS, LEVEL_LABELS } from "@/lib/content/schema";

export const metadata: Metadata = { title: "Laboratuvarlar" };

export default function LabsPage() {
  const { lessons } = getCatalog();
  const all = Object.values(lessons);
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Laboratuvarlar</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Her laboratuvar etkileşimli bir defterdir: deneyler, gerçek Python kodu, model eğitimi ve görevler. Seviyeye göre sıralandı.
        </p>
      </header>
      {LEVELS.map((level) => {
        const items = all.filter((l) => l.level === level);
        if (items.length === 0) return null;
        return (
          <section key={level}>
            <h2 className="mb-3 text-lg font-bold">{LEVEL_LABELS[level]}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
