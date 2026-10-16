"use client";

import { LogIn, School, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { ApiError, errorMessage } from "@/lib/api/client";
import { homeFor } from "@/lib/session/routes";
import { useSession } from "@/lib/session/store";
import type { SessionUser } from "@/lib/session/types";

function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, user, apiAvailable, demoMode, login, startDemo } = useSession();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const passwordId = useId();

  const go = (u: SessionUser) => router.replace(u.must_change_password ? "/sifre" : (safeNext(params.get("sonra")) ?? homeFor(u)));

  useEffect(() => {
    if (status === "authenticated" && user) go(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      go(await login(name, password));
    } catch (err) {
      if (err instanceof ApiError && err.code === "too_many_login_attempts" && err.retryAfter) {
        setError(`${err.message} (yaklaşık ${Math.ceil(err.retryAfter / 60)} dakika)`);
      } else setError(errorMessage(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const demo = async (role: "student" | "teacher") => {
    setBusy(true);
    setError(null);
    try {
      go(await startDemo(role));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" aria-label="AI Atölye ana sayfa" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h1 className="text-xl font-extrabold">Giriş yap</h1>
        <p className="mt-1 text-sm text-muted">Öğrenciler öğretmenlerinin verdiği kullanıcı adıyla, öğretmenler e-postalarıyla girer.</p>
        {apiAvailable === false && (
          <Callout tone="warning" className="mt-4">
            Sunucuya şu an ulaşılamıyor. Hesapsız devam edebilirsin; çalışman bu tarayıcıda saklanır.
          </Callout>
        )}
        {status === "expired" && <Callout tone="info" className="mt-4">Oturumun sona erdi. Bu cihazdaki çalışman kaybolmadı; giriş yapınca gönderilecek.</Callout>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor={nameId} className="text-sm font-semibold">
              Kullanıcı adı ya da e-posta
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="mt-1 h-11 w-full rounded-lg border border-border-strong bg-surface px-3"
            />
          </div>
          <div>
            <label htmlFor={passwordId} className="text-sm font-semibold">
              Şifre
            </label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 h-11 w-full rounded-lg border border-border-strong bg-surface px-3"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft p-2.5 text-sm text-danger" data-testid="login-error">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy || apiAvailable === false}>
            <LogIn aria-hidden className="size-4" /> Giriş yap
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">Şifreni unuttuysan öğretmenine söyle; yeni bir tek seferlik şifre verebilir.</p>
      </div>
      {demoMode && (
        <div className="mt-6 w-full max-w-sm rounded-2xl border border-dashed border-border-strong p-4 text-center text-sm">
          <p className="font-semibold">Demo sunucusu</p>
          <p className="text-xs text-muted">Bu sunucuda deneme hesapları açılabilir (1 gün sonra silinir).</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => demo("teacher")}>
              <School aria-hidden className="size-4" /> Demo öğretmen
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => demo("student")}>
              <UserRound aria-hidden className="size-4" /> Demo öğrenci
            </Button>
          </div>
        </div>
      )}
      <Link href="/ana-sayfa" className="mt-6 text-sm font-semibold text-muted hover:text-text">
        Hesapsız dene (çalışman yalnızca bu tarayıcıda kalır) →
      </Link>
    </div>
  );
}
