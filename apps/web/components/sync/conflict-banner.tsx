"use client";

import { AlertTriangle, Laptop, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readJson } from "@/lib/storage";
import type { SavedNotebook } from "@/lib/notebook/types";
import { useSync } from "@/lib/sync/store";

const fmt = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "bilinmiyor";

/** Shown when the same notebook was changed on two devices. Nothing is overwritten until the student chooses. */
export function ConflictBanner({ lessonId, onUseServer }: { lessonId: string; onUseServer: () => Promise<void> }) {
  const conflict = useSync((s) => s.conflicts[lessonId]);
  const resolve = useSync((s) => s.resolve);
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const local = readJson<SavedNotebook>(`notebook:${lessonId}`);
  const tasks = (nb: SavedNotebook | null) => Object.keys(nb?.completions ?? {}).length;

  return (
    <div role="alertdialog" aria-labelledby="conflict-title" className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-warning bg-surface p-4 shadow-xl" data-testid="sync-conflict">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 md:flex-row md:items-center">
        <AlertTriangle aria-hidden className="size-6 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-sm">
          <p id="conflict-title" className="font-semibold">Bu defter başka bir cihazda da değiştirilmiş.</p>
          <p className="text-muted">
            Hangisini kullanalım? Seçmediğin sürüm silinir. Bu cihazda: {tasks(local)} tamamlanmış görev (son kayıt {fmt(local?.savedAt)}). Diğer cihazda:{" "}
            {tasks(conflict.serverState)} tamamlanmış görev (son kayıt {fmt(conflict.serverState.savedAt)}).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={async () => (setBusy(true), await resolve(lessonId, "local"), setBusy(false))}>
            <Laptop aria-hidden className="size-4" /> Bu cihazdakini kullan
          </Button>
          <Button size="sm" disabled={busy} onClick={async () => (setBusy(true), await onUseServer(), setBusy(false))}>
            <MonitorSmartphone aria-hidden className="size-4" /> Diğer cihazdakini kullan
          </Button>
        </div>
      </div>
    </div>
  );
}
