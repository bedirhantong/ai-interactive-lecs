"use client";

import { Download, Eye, KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { useSession } from "@/lib/session/store";
import type { SessionUser } from "@/lib/session/types";
import { downloadJson } from "./download";

const ROLE_LABELS = { student: "Öğrenci", teacher: "Öğretmen", admin: "Yönetici" };
const AGE_BANDS = ["11-13", "14-15", "16-18"] as const;
const section = "rounded-2xl border border-border bg-surface p-6 shadow-card";

interface AccessLogEntry {
  id: number;
  description: string;
  by: string | null;
  by_role: string | null;
  by_me: boolean;
  at: string;
}

/** Signed-in accounts: profile on the server, password, KVKK rights (export, access log, erasure). */
export function AccountSettings() {
  const user = useSession((s) => s.user);
  if (!user) return null;
  return (
    <div className="space-y-6">
      <ProfileForm user={user} />
      <section className={section}>
        <h2 className="font-bold">Şifre</h2>
        <p className="text-sm text-muted">Şifreni değiştirince diğer cihazlardaki oturumların kapanır.</p>
        {user.is_demo ? (
          <p className="mt-2 text-sm text-muted">Demo hesaplarının şifresi yoktur.</p>
        ) : (
          <ButtonLink href="/sifre" variant="secondary" size="sm" className="mt-3">
            <KeyRound aria-hidden className="size-3.5" /> Şifremi değiştir
          </ButtonLink>
        )}
      </section>
      <MyData user={user} />
    </div>
  );
}

function ProfileForm({ user }: { user: SessionUser }) {
  const setUser = useSession((s) => s.setUser);
  const [name, setName] = useState(user.display_name);
  const [message, setMessage] = useState<string | null>(null);
  const nameId = useId();

  const save = async (patch: Record<string, unknown>) => {
    setMessage(null);
    try {
      const { data } = await api<SessionUser>("/me", { method: "PATCH", body: patch });
      setUser(data);
      setMessage("Kaydedildi.");
    } catch (err) {
      setMessage(errorMessage(err));
    }
  };

  return (
    <section className={section}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">Hesabım</h2>
        <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
        {user.is_demo && <Badge tone="warning">Demo hesap</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">
        Giriş: <span className="font-mono">{user.username ?? user.email}</span>
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ display_name: name });
        }}
      >
        <div>
          <label htmlFor={nameId} className="text-sm font-semibold">
            Görünen ad
          </label>
          <input id={nameId} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="mt-1 h-10 w-64 rounded-lg border border-border-strong bg-surface px-3" />
        </div>
        <Button type="submit" variant="secondary" disabled={!name.trim() || name === user.display_name}>
          Kaydet
        </Button>
      </form>
      {user.role === "student" && (
        <div className="mt-4">
          <div className="text-sm font-semibold">
            Yaş aralığı <span className="font-normal text-muted">(isteğe bağlı; doğum tarihi sorulmaz)</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Yaş aralığı">
            {[...AGE_BANDS, null].map((band) => (
              <button
                key={band ?? "none"}
                type="button"
                role="radio"
                aria-checked={user.age_band === band}
                onClick={() => void save({ age_band: band })}
                className={`h-9 rounded-lg border px-3 text-sm font-semibold ${user.age_band === band ? "border-brand bg-brand-soft text-brand-strong" : "border-border"}`}
              >
                {band ?? "Belirtmek istemiyorum"}
              </button>
            ))}
          </div>
        </div>
      )}
      {message && (
        <p className="mt-2 text-sm text-muted" role="status">
          {message}
        </p>
      )}
    </section>
  );
}

function MyData({ user }: { user: SessionUser }) {
  const router = useRouter();
  const logout = useSession((s) => s.logout);
  const [showLog, setShowLog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const passwordId = useId();
  const log = useApi<AccessLogEntry[]>(showLog ? "/me/access-log?limit=50" : null);

  const exportData = async () => {
    setError(null);
    try {
      const { data } = await api<unknown>("/me/export");
      downloadJson("ai-atolye-hesap-verilerim.json", data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const deleteAccount = async () => {
    setError(null);
    try {
      await api("/me/delete", { method: "POST", body: { password: user.is_demo ? null : password, confirm: true } });
      await logout();
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className={section}>
      <h2 className="font-bold">Verilerim (KVKK)</h2>
      <p className="text-sm text-muted">Hesabınla ilgili sunucuda saklanan her şeyi indirebilir, kimin eriştiğini görebilir ve hesabını tamamen silebilirsin.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={exportData}>
          <Download aria-hidden className="size-3.5" /> Verilerimi indir
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
          <Eye aria-hidden className="size-3.5" /> Verime kim erişti?
        </Button>
        {user.role !== "admin" && !confirm && (
          <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden className="size-3.5" /> Hesabımı sil
          </Button>
        )}
      </div>

      {showLog && (
        <div className="mt-4" data-testid="access-log">
          {log.loading && <p className="text-sm text-muted">Yükleniyor…</p>}
          {log.data?.length === 0 && <p className="text-sm text-muted">Kayıt yok.</p>}
          <ul className="space-y-1 text-sm">
            {log.data?.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 rounded-lg px-2 py-1 odd:bg-surface-2">
                <span className="font-mono text-xs text-muted">{new Date(e.at).toLocaleString("tr-TR")}</span>
                <span className="font-semibold">{e.by_me ? "Sen" : (e.by ?? "Silinmiş bir hesap")}</span>
                <span>{e.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirm && (
        <div className="mt-4 space-y-2 rounded-xl border border-danger/40 bg-danger-soft p-4 text-sm">
          <p className="font-semibold text-danger">Hesabın ve tüm çalışmaların kalıcı olarak silinecek. Geri alınamaz.</p>
          {user.role === "teacher" && <p>Sınıfların ve ödevlerin de silinir; açtığın öğrenci hesapları kalır.</p>}
          {!user.is_demo && (
            <div>
              <label htmlFor={passwordId} className="font-semibold">
                Onay için şifren
              </label>
              <input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-10 w-64 rounded-lg border border-border-strong bg-surface px-3"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={!user.is_demo && !password} onClick={deleteAccount}>
              Evet, hesabımı sil
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
