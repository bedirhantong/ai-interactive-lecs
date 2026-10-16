"use client";

import { Loader2, Play, Square } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ExecState } from "@/lib/notebook/types";
import { useRuntime, useRuntimeSnapshot } from "./context";

export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} sn`;
}

/** Run / stop control with execution count, duration and runtime status. */
export function RunBar({
  exec,
  onRun,
  runLabel = "Çalıştır",
  children,
}: {
  exec: ExecState;
  onRun: () => void;
  runLabel?: string;
  children?: ReactNode;
}) {
  const runtime = useRuntime();
  const snap = useRuntimeSnapshot();
  const running = exec.status === "running";
  const waiting = running && snap.status === "loading";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {running ? (
        <Button variant="danger" size="sm" onClick={() => runtime.stop("user")} title="Çalışan kodu durdurur ve Python ortamını yeniden başlatır">
          <Square aria-hidden className="size-3.5" />
          Durdur
        </Button>
      ) : (
        <Button size="sm" onClick={onRun} title="Shift + Enter">
          <Play aria-hidden className="size-3.5" />
          {runLabel}
        </Button>
      )}
      {children}
      <span className="ml-auto flex items-center gap-2 font-mono text-xs text-muted" aria-live="polite">
        {running && (
          <>
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            {waiting ? (snap.message ?? "Python hazırlanıyor…") : "çalışıyor…"}
          </>
        )}
        {!running && exec.executionCount !== null && (
          <>
            <span title="Çalıştırma sırası">[{exec.executionCount}]</span>
            <span>{formatDuration(exec.durationMs)}</span>
          </>
        )}
      </span>
    </div>
  );
}
