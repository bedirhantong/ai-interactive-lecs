"use client";

import { ArrowLeft, Check, ClipboardList, KeyRound, Printer, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useId, useState } from "react";
import { RequireAccount } from "@/components/auth/require-account";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { api, errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { type AssignmentOut, type ClassroomOut, type Credential, type StudentSummary, type TeacherCatalog, dateTime } from "./types";

export function ClassroomPage({ catalog }: { catalog: TeacherCatalog }) {
  return (
    <RequireAccount roles={["teacher", "admin"]}>
      <ClassroomView catalog={catalog} />
    </RequireAccount>
  );
}

function ClassroomView({ catalog }: { catalog: TeacherCatalog }) {
  const { classroomId } = useParams<{ classroomId: string }>();
  const classrooms = useApi<ClassroomOut[]>("/classrooms");
  const overview = useApi<StudentSummary[]>(`/classrooms/${classroomId}/overview`);
  const assignments = useApi<AssignmentOut[]>(`/classrooms/${classroomId}/assignments`);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const room = classrooms.data?.find((c) => String(c.id) === classroomId);
  const title = (id: string) => catalog.lessons.find((l) => l.id === id)?.title ?? id;

  if (overview.error) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-danger">{overview.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <BackLink />
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{room?.name ?? "Sınıf"}</h1>
        {room?.join_code && (
          <p className="mt-1 text-sm text-muted">
            Sınıf kodu <span className="font-mono font-semibold text-text">{room.join_code}</span>: kendi hesabı olan öğrenciler bu kodla katılma isteği gönderebilir;
            sen onaylayana kadar hiçbir şey göremezler.
          </p>
        )}
      </header>

      <AddStudents classroomId={classroomId} onCreated={(c) => (setCredentials(c), void overview.reload())} />
      {credentials.length > 0 && <CredentialSheet credentials={credentials} classroom={room?.name ?? ""} onClose={() => setCredentials([])} />}

      <section>
        <h2 className="mb-3 text-lg font-bold">Öğrenciler</h2>
        {overview.loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />
        ) : (
          <StudentsTable
            classroomId={classroomId}
            rows={overview.data ?? []}
            title={title}
            onChanged={() => void overview.reload()}
            onCredential={(c) => setCredentials([c])}
          />
        )}
        <p className="mt-2 text-xs text-subtle">
          Bilgiler öğrencinin tarayıcısında hesaplanır ve sunucuya gönderilir (öz bildirim); not vermek için tek başına kanıt sayılmaz. Bu sayfayı açman öğrencilerin
          “verime kim erişti” kaydında görünür.
        </p>
      </section>

      <Assignments classroomId={classroomId} items={assignments.data ?? []} catalog={catalog} title={title} onChanged={() => void assignments.reload()} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/ogretmen" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-text">
      <ArrowLeft aria-hidden className="size-4" /> Sınıflarım
    </Link>
  );
}

function AddStudents({ classroomId, onCreated }: { classroomId: string; onCreated: (c: Credential[]) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const names = text
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api<Credential[]>(`/classrooms/${classroomId}/students/bulk`, {
        method: "POST",
        body: { students: names.map((display_name) => ({ display_name })) },
      });
      setText("");
      onCreated(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <form onSubmit={submit}>
        <label htmlFor={id} className="flex items-center gap-2 font-semibold">
          <UserPlus aria-hidden className="size-4 text-brand" /> Öğrenci hesabı aç
        </label>
        <p className="mt-1 text-sm text-muted">
          Her satıra bir öğrenci. Gerçek tam ad yerine ad ve soyadın baş harfi yeterli (ör. “Ayşe K.”). E-posta gerekmez; her öğrenciye bir kullanıcı adı ve tek seferlik şifre
          verilir.
        </p>
        <textarea
          id={id}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Ayşe K.\nMehmet Y.\nZeynep A."}
          className="mt-3 block w-full rounded-lg border border-border-strong bg-surface p-3 text-sm"
          data-testid="student-names"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" disabled={busy || names.length === 0 || names.length > 40}>
            <UserPlus aria-hidden className="size-4" /> {names.length || ""} hesap oluştur
          </Button>
          {names.length > 40 && <span className="text-sm text-danger">Tek seferde en fazla 40 öğrenci.</span>}
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </form>
    </section>
  );
}

/** One-time passwords are shown once: print or note them now. */
function CredentialSheet({ credentials, classroom, onClose }: { credentials: Credential[]; classroom: string; onClose: () => void }) {
  return (
    <section className="space-y-3" data-testid="credentials">
      <Callout tone="warning" title="Bu şifreler yalnızca şimdi görünür">
        Kartları yazdır ya da not al. Şifreler sunucuda yalnızca geri döndürülemez özet olarak saklanır; tekrar gösterilemez. Unutan öğrenci için şifre sıfırlayabilirsin. Öğrenci ilk
        girişte kendi şifresini belirler.
      </Callout>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden className="size-4" /> Kartları yazdır
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Kapat
        </Button>
      </div>
      <div className="print-area grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {credentials.map((c) => (
          <div key={c.user_id} className="break-inside-avoid rounded-xl border-2 border-dashed border-border-strong bg-surface p-4" data-testid="credential-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">AI Atölye · {classroom}</div>
            <div className="mt-1 text-lg font-bold">{c.display_name}</div>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Kullanıcı adı</dt>
                <dd className="font-mono font-semibold" data-testid="credential-login">
                  {c.login}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">İlk şifre</dt>
                <dd className="font-mono font-semibold" data-testid="credential-password">
                  {c.one_time_password}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] text-muted">{typeof window !== "undefined" ? window.location.origin : ""}/giris adresinden gir; ilk girişte kendi şifreni seç.</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StudentsTable({
  classroomId,
  rows,
  title,
  onChanged,
  onCredential,
}: {
  classroomId: string;
  rows: StudentSummary[];
  title: (id: string) => string;
  onChanged: () => void;
  onCredential: (c: Credential) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const act = async (userId: string, fn: () => Promise<void>) => {
    setBusy(userId);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) return <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">Bu sınıfta henüz öğrenci yok.</p>;

  return (
    <div>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5">Öğrenci</th>
              <th className="px-4 py-2.5">Son etkinlik</th>
              <th className="px-4 py-2.5">Bitirdiği dersler</th>
              <th className="px-4 py-2.5 text-right">Geçilen görev</th>
              <th className="px-4 py-2.5 text-right">Colab</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t border-border align-top" data-testid="student-row">
                <td className="px-4 py-3">
                  {r.status === "active" ? (
                    <Link href={`/ogretmen/${classroomId}/ogrenci/${r.user_id}`} className="font-semibold hover:text-brand">
                      {r.display_name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{r.display_name}</span>
                  )}
                  <div className="font-mono text-xs text-muted">{r.username ?? "kendi hesabı"}</div>
                  {r.status === "pending" && <Badge tone="warning">Onay bekliyor</Badge>}
                </td>
                <td className="px-4 py-3 text-muted">{dateTime(r.last_activity_at)}</td>
                <td className="px-4 py-3">
                  {r.completed_lessons.length ? (
                    <ul className="space-y-0.5">
                      {r.completed_lessons.map((l) => (
                        <li key={l} className="text-xs">
                          {title(l)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.challenges_passed}</td>
                <td className="px-4 py-3 text-right font-mono">{r.reports ? `%${((r.latest_test_accuracy ?? 0) * 100).toFixed(1)}` : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        variant="soft"
                        disabled={busy === r.user_id}
                        onClick={() => act(r.user_id, async () => (await api(`/classrooms/${classroomId}/members/${r.user_id}/approve`, { method: "POST" }), onChanged()))}
                      >
                        <Check aria-hidden className="size-3.5" /> Onayla
                      </Button>
                    )}
                    {r.status === "active" && r.username && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Yeni tek seferlik şifre üretir ve öğrenciyi tüm cihazlardan çıkarır"
                        disabled={busy === r.user_id}
                        onClick={() =>
                          act(r.user_id, async () => {
                            const { data } = await api<Credential>(`/classrooms/${classroomId}/students/${r.user_id}/reset-password`, { method: "POST" });
                            onCredential(data);
                          })
                        }
                      >
                        <KeyRound aria-hidden className="size-3.5" /> Şifre sıfırla
                      </Button>
                    )}
                    {confirmRemove === r.user_id ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy === r.user_id}
                        onClick={() =>
                          act(r.user_id, async () => {
                            await api(`/classrooms/${classroomId}/members/${r.user_id}`, { method: "DELETE" });
                            setConfirmRemove(null);
                            onChanged();
                          })
                        }
                      >
                        Eminim, çıkar
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" title="Sınıftan çıkarır; hesap ve çalışmaları silinmez" onClick={() => setConfirmRemove(r.user_id)}>
                        <UserMinus aria-hidden className="size-3.5" /> Çıkar
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Assignments({
  classroomId,
  items,
  catalog,
  title,
  onChanged,
}: {
  classroomId: string;
  items: AssignmentOut[];
  catalog: TeacherCatalog;
  title: (id: string) => string;
  onChanged: () => void;
}) {
  const [lessonId, setLessonId] = useState(catalog.lessons[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();
  const dueId = useId();

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/classrooms/${classroomId}/assignments`, { method: "POST", body: { lesson_id: lessonId, due_at: due ? new Date(`${due}T23:59:00`).toISOString() : null } });
      setDue("");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <ClipboardList aria-hidden className="size-5 text-brand" /> Ödevler
      </h2>
      {items.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm" data-testid="assignment">
              <Link href={`/ders/${a.lesson_id}`} className="font-semibold hover:text-brand">
                {title(a.lesson_id)}
              </Link>
              <span className="text-muted">{a.due_at ? `Son tarih: ${new Date(a.due_at).toLocaleDateString("tr-TR")}` : "Son tarih yok"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">Henüz ödev yok.</p>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="min-w-56 flex-1">
          <label htmlFor={selectId} className="text-sm font-semibold">
            Ders
          </label>
          <select id={selectId} value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border-strong bg-surface px-2 text-sm">
            {catalog.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={dueId} className="text-sm font-semibold">
            Son tarih (isteğe bağlı)
          </label>
          <input id={dueId} type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 h-10 rounded-lg border border-border-strong bg-surface px-2 text-sm" />
        </div>
        <Button type="submit">Ödev ver</Button>
        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </form>
    </section>
  );
}
