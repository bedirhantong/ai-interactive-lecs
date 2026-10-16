"use client";

import { CheckCircle2, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useApi } from "@/lib/api/use-api";
import type { LessonSummary } from "@/lib/content/loader";
import { useProgress } from "@/lib/progress/store";
import { useSession } from "@/lib/session/store";

interface Classroom {
  id: number;
  name: string;
}
interface Assignment {
  id: number;
  lesson_id: string;
  due_at: string | null;
}

/** Signed-in students: assignments from their classrooms, with their own progress. */
export function MyAssignments({ lessons }: { lessons: Record<string, LessonSummary> }) {
  const { status, user } = useSession();
  const active = status === "authenticated" && user?.role === "student" && !user.must_change_password;
  const classrooms = useApi<Classroom[]>(active ? "/classrooms" : null);
  if (!active || !classrooms.data?.length) return null;
  return (
    <section className="mb-10 space-y-4" data-testid="my-assignments">
      {classrooms.data.map((c) => (
        <ClassAssignments key={c.id} classroom={c} lessons={lessons} />
      ))}
    </section>
  );
}

function ClassAssignments({ classroom, lessons }: { classroom: Classroom; lessons: Record<string, LessonSummary> }) {
  const assignments = useApi<Assignment[]>(`/classrooms/${classroom.id}/assignments`);
  const progress = useProgress((s) => s.lessons);
  if (!assignments.data) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="flex items-center gap-2 font-bold">
        <ClipboardList aria-hidden className="size-5 text-brand" /> Ödevlerim · {classroom.name}
      </h2>
      {assignments.data.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Öğretmenin henüz ödev vermedi.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {assignments.data.map((a) => {
            const lesson = lessons[a.lesson_id];
            const p = progress[a.lesson_id];
            const done = !!p?.completedAt;
            return (
              <li key={a.id}>
                <Link href={`/ders/${a.lesson_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-2.5 text-sm hover:border-border-strong">
                  <span className="font-semibold">{lesson?.title ?? a.lesson_id}</span>
                  <span className="flex items-center gap-2 text-muted">
                    {a.due_at && <span>Son tarih {new Date(a.due_at).toLocaleDateString("tr-TR")}</span>}
                    {done ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-success">
                        <CheckCircle2 aria-hidden className="size-4" /> Bitti
                      </span>
                    ) : (
                      <span>
                        {p?.completedRequired.length ?? 0}/{lesson?.requiredCellIds.length ?? "?"} görev
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
