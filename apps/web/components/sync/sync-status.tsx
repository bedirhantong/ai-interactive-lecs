"use client";

import { CloudAlert, CloudCheck, CloudOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session/store";
import { useSync } from "@/lib/sync/store";

/** Small indicator: where is my work saved right now? */
export function SyncStatus({ className }: { className?: string }) {
  const session = useSession((s) => s.status);
  const sync = useSync((s) => s.status);
  const base = cn("inline-flex items-center gap-1.5 text-xs", className);

  if (session === "guest" || session === "unknown") return null;
  if (session === "expired") {
    return (
      <Link href="/giris" className={cn(base, "font-semibold text-warning")} data-testid="sync-status">
        <CloudAlert aria-hidden className="size-3.5" /> Oturum sona erdi · tekrar giriş yap
      </Link>
    );
  }
  if (session === "offline" || sync === "offline") {
    return (
      <span className={cn(base, "text-muted")} title="Çalışman bu cihazda güvende; bağlantı gelince gönderilecek." data-testid="sync-status">
        <CloudOff aria-hidden className="size-3.5" /> Çevrimdışı · bu cihazda kayıtlı
      </span>
    );
  }
  if (sync === "conflict") {
    return (
      <span className={cn(base, "font-semibold text-warning")} data-testid="sync-status">
        <CloudAlert aria-hidden className="size-3.5" /> Çakışma var
      </span>
    );
  }
  if (sync === "syncing") {
    return (
      <span className={cn(base, "text-muted")} data-testid="sync-status">
        <Loader2 aria-hidden className="size-3.5 animate-spin" /> Eşitleniyor…
      </span>
    );
  }
  return (
    <span className={cn(base, "text-muted")} title="Çalışman hesabına kaydedildi." data-testid="sync-status">
      <CloudCheck aria-hidden className="size-3.5 text-success" /> Hesabına kaydedildi
    </span>
  );
}
