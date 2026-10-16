"use client";

import { LogIn } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";
import { useSession } from "@/lib/session/store";
import type { Role } from "@/lib/session/types";

/** Renders children only for a signed-in user with one of `roles` (the API enforces this too). */
export function RequireAccount({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { status, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user?.must_change_password && pathname !== "/sifre") router.replace("/sifre");
  }, [user, pathname, router]);

  if (status === "unknown") return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" aria-busy="true" />;
  if (status !== "authenticated" || !user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="text-lg font-bold">{status === "expired" ? "Oturumun sona erdi" : "Bu sayfa için giriş yapmalısın"}</p>
        <p className="mt-1 text-sm text-muted">
          {status === "offline" ? "Sunucuya şu an ulaşılamıyor. Bağlantı gelince tekrar dene." : "Hesabınla giriş yaptıktan sonra buraya dönebilirsin."}
        </p>
        <ButtonLink href={`/giris?sonra=${encodeURIComponent(pathname)}`} className="mt-4">
          <LogIn aria-hidden className="size-4" /> Giriş yap
        </ButtonLink>
      </div>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return <p className="rounded-2xl border border-border bg-surface p-8 text-center text-muted">Bu sayfa senin hesap türün için değil.</p>;
  }
  return children;
}
