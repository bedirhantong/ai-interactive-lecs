"use client";

import { Plus, School, Users } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/lib/session/store";
import type { ClassroomOut } from "./types";

export function TeacherHome() {
  const user = useSession((s) => s.user);
  const classrooms = useApi<ClassroomOut[]>("/classrooms");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/classrooms", { method: "POST", body: { name } });
      setName("");
      await classrooms.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Merhaba{user ? `, ${user.display_name}` : ""}</h1>
        <p className="mt-1 text-muted">Sınıflarını yönet, öğrenci hesabı aç, ödev ver ve öğrencilerinin çalışmalarını incele.</p>
        {user?.is_demo && <p className="mt-2 text-xs text-warning">Demo öğretmen hesabı: bir gün sonra tüm verileriyle silinir.</p>}
      </header>

      <section>
        <h2 className="mb-3 text-lg font-bold">Sınıflarım</h2>
        {classrooms.loading && <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />}
        {classrooms.error && <p className="text-sm text-danger">{classrooms.error}</p>}
        {classrooms.data?.length === 0 && <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">Henüz sınıfın yok. Aşağıdan ilk sınıfını oluştur.</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classrooms.data?.map((c) => (
            <Link key={c.id} href={`/ogretmen/${c.id}`} className="group rounded-2xl border border-border bg-surface p-5 shadow-card hover:border-border-strong" data-testid="classroom-card">
              <School aria-hidden className="size-6 text-brand" />
              <div className="mt-2 text-lg font-bold group-hover:text-brand">{c.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Users aria-hidden className="size-4" /> Sınıf kodu: <span className="font-mono font-semibold text-text">{c.join_code}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="max-w-md rounded-2xl border border-border bg-surface p-5 shadow-card">
        <form onSubmit={create}>
          <label htmlFor={inputId} className="font-semibold">
            Yeni sınıf
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={inputId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. 7-A Yapay Zekâ"
              maxLength={80}
              required
              className="h-10 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3"
            />
            <Button type="submit" disabled={busy || !name.trim()}>
              <Plus aria-hidden className="size-4" /> Oluştur
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </form>
      </section>
    </div>
  );
}
