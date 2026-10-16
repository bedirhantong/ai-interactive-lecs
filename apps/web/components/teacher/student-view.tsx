"use client";

import { ArrowLeft, BarChart3, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { RequireAccount } from "@/components/auth/require-account";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { EVENT_LABELS, type EventOut, type ReflectionOut, type ReportOut, type StudentSummary, type TeacherCatalog, dateTime } from "./types";

export function StudentPage({ catalog }: { catalog: TeacherCatalog }) {
  return (
    <RequireAccount roles={["teacher", "admin"]}>
      <StudentView catalog={catalog} />
    </RequireAccount>
  );
}

function StudentView({ catalog }: { catalog: TeacherCatalog }) {
  const { classroomId, studentId } = useParams<{ classroomId: string; studentId: string }>();
  const base = `/classrooms/${classroomId}/students/${studentId}`;
  const reflections = useApi<ReflectionOut[]>(`${base}/reflections`);
  const reports = useApi<ReportOut[]>(`${base}/reports`);
  const firstPage = useApi<EventOut[]>(`${base}/progress?limit=30`);
  const overview = useApi<StudentSummary[]>(`/classrooms/${classroomId}/overview`);
  const [more, setMore] = useState<EventOut[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const student = overview.data?.find((s) => s.user_id === studentId);
  const title = (id: string) => catalog.lessons.find((l) => l.id === id)?.title ?? id;
  const next = cursor === undefined ? (firstPage.pagination?.next_cursor ?? null) : cursor;
  const events = [...(firstPage.data ?? []), ...more];

  const loadMore = async () => {
    try {
      const page = await api<EventOut[]>(`${base}/progress?limit=30&cursor=${next}`);
      setMore((m) => [...m, ...page.data]);
      setCursor(page.pagination?.next_cursor ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const fatal = firstPage.error ?? reflections.error;
  return (
    <div className="space-y-8">
      <header>
        <Link href={`/ogretmen/${classroomId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-text">
          <ArrowLeft aria-hidden className="size-4" /> Sınıfa dön
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{student?.display_name ?? "Öğrenci"}</h1>
        {student && (
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">{student.username}</span> · son etkinlik {dateTime(student.last_activity_at)} · {student.completed_lessons.length} ders bitirdi ·{" "}
            {student.challenges_passed} görev geçti
          </p>
        )}
      </header>
      {fatal && <p className="text-danger">{fatal}</p>}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <MessageSquareText aria-hidden className="size-5 text-brand" /> Yansıtma yazıları
        </h2>
        {reflections.data?.length === 0 && <p className="text-sm text-muted">Henüz gönderilmiş bir yansıtma yazısı yok.</p>}
        <div className="space-y-3">
          {reflections.data?.map((r) => (
            <article key={`${r.lesson_id}:${r.cell_id}`} className="rounded-2xl border border-border bg-surface p-5 shadow-card" data-testid="reflection">
              <div className="text-xs font-semibold text-muted">
                {title(r.lesson_id)} · {dateTime(r.submitted_at)}
              </div>
              {catalog.reflectionPrompts[`${r.lesson_id}:${r.cell_id}`] && (
                <p className="mt-1 text-sm font-semibold">{catalog.reflectionPrompts[`${r.lesson_id}:${r.cell_id}`]}</p>
              )}
              <blockquote className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{r.text}</blockquote>
            </article>
          ))}
        </div>
        <p className="mt-2 text-xs text-subtle">Yansıtmalar otomatik puanlanmaz; doğru ya da yanlış cevap yoktur.</p>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <BarChart3 aria-hidden className="size-5 text-brand" /> Colab raporları
        </h2>
        {reports.data?.length === 0 ? (
          <p className="text-sm text-muted">Colab raporu yüklenmemiş.</p>
        ) : (
          <ul className="space-y-2">
            {reports.data?.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
                <span className="font-semibold">{title(r.lesson_id)}</span>
                <span className="text-muted">
                  test doğruluğu <strong className="font-mono text-text">%{(r.test_accuracy * 100).toFixed(1)}</strong> · defter {r.notebook_version} · {dateTime(r.created_at)} · öz
                  bildirim
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Yaptıkları (en yeni önce)</h2>
        {events.length === 0 && !firstPage.loading && <p className="text-sm text-muted">Henüz kayıt yok.</p>}
        <ol className="space-y-1.5">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 rounded-lg px-3 py-1.5 text-sm odd:bg-surface-2" data-testid="event">
              <span className="w-28 shrink-0 font-mono text-xs text-muted">{dateTime(e.occurred_at)}</span>
              <span className="font-semibold">{EVENT_LABELS[e.kind] ?? e.kind}</span>
              <span className="text-muted">{title(e.lesson_id)}</span>
              {e.detail && <span className="text-xs text-subtle">{e.detail}</span>}
            </li>
          ))}
        </ol>
        {next !== null && events.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={loadMore}>
            Daha eskiler
          </Button>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>
    </div>
  );
}
