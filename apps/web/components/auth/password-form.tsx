"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ApiError, errorMessage } from "@/lib/api/client";
import { homeFor } from "@/lib/session/routes";
import { useSession } from "@/lib/session/store";
import { useSync } from "@/lib/sync/store";

export function PasswordForm() {
  const router = useRouter();
  const { user, changePassword } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ids = { current: useId(), next: useId(), repeat: useId() };
  if (!user) return null;
  const forced = user.must_change_password;
  const min = user.role === "student" ? 8 : 12;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return setErrors(["Yeni şifreler aynı değil."]);
    setBusy(true);
    setErrors([]);
    try {
      const updated = await changePassword(current, next);
      void useSync.getState().syncNow({ pull: true });
      router.replace(homeFor(updated));
    } catch (err) {
      if (err instanceof ApiError && err.code === "weak_password") setErrors(err.details.map((d) => String(d.message)));
      else setErrors([errorMessage(err)]);
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 h-11 w-full rounded-lg border border-border-strong bg-surface px-3";
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold tracking-tight">{forced ? "Kendi şifreni belirle" : "Şifre değiştir"}</h1>
      {forced && (
        <Callout tone="info" className="mt-3">
          Öğretmeninin verdiği tek seferlik şifreyle girdin. Devam etmek için yalnızca senin bileceğin bir şifre seç.
        </Callout>
      )}
      <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div>
          <label htmlFor={ids.current} className="text-sm font-semibold">
            {forced ? "Tek seferlik şifre" : "Mevcut şifre"}
          </label>
          <input id={ids.current} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor={ids.next} className="text-sm font-semibold">
            Yeni şifre
          </label>
          <input id={ids.next} type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={field} />
          <p className="mt-1 text-xs text-muted">
            En az {min} karakter. Uzun ama hatırlaması kolay bir cümle en iyisi, ör. <span className="font-mono">mavi-bisiklet-yaz-2026</span>. Adını içermesin.
          </p>
        </div>
        <div>
          <label htmlFor={ids.repeat} className="text-sm font-semibold">
            Yeni şifre (tekrar)
          </label>
          <input id={ids.repeat} type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} className={field} />
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="list-disc space-y-0.5 rounded-lg bg-danger-soft p-3 pl-7 text-sm text-danger" data-testid="password-errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          <KeyRound aria-hidden className="size-4" /> Şifreyi kaydet
        </Button>
        <p className="text-xs text-muted">Şifre değişince diğer cihazlardaki oturumların kapanır.</p>
      </form>
    </div>
  );
}
