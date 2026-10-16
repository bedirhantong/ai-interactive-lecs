"use client";

import { History, Lightbulb } from "lucide-react";
import type { ExecState } from "@/lib/notebook/types";
import { explainError } from "@/lib/tutor/error-explainer";
import { cn } from "@/lib/cn";
import { useNotebook } from "./context";

export function OutputView({ exec, code, label = "Çıktı" }: { exec: ExecState; code: string; label?: string }) {
  const sessionId = useNotebook((s) => s.sessionId);
  const hasOutput = exec.outputs.length > 0 || exec.error;
  if (!hasOutput && exec.status !== "running") return null;
  const stale = exec.sessionId !== null && exec.sessionId !== sessionId;
  const explanation = exec.error ? explainError(exec.error, code) : null;

  return (
    <div className="mt-3 space-y-2" aria-live="polite">
      {stale && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <History aria-hidden className="size-3.5" />
          Önceki oturumdan kalan çıktı. Python değişkenleri bellekte değil; gerekirse hücreyi tekrar çalıştır.
        </p>
      )}
      {exec.outputs.length > 0 && (
        <div className="rounded-lg border border-border bg-code-bg" role="region" aria-label={label}>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-5" data-testid="cell-output">
            {exec.outputs.map((o, i) => (
              <span
                key={i}
                className={cn(
                  o.stream === "stderr" && "text-danger",
                  o.stream === "info" && "text-subtle italic",
                  o.stream === "result" && "text-brand-strong",
                )}
              >
                {o.stream === "result" ? `→ ${o.text}\n` : o.text}
              </span>
            ))}
          </pre>
        </div>
      )}
      {exec.error && explanation && (
        <div className="overflow-hidden rounded-lg border border-danger/30" data-testid="cell-error">
          <pre className="overflow-auto whitespace-pre-wrap bg-danger-soft p-3 font-mono text-[13px] leading-5 text-danger">
            {exec.error.traceback}
          </pre>
          <div className="flex gap-2.5 bg-surface p-3 text-sm">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <p className="font-semibold">{explanation.title}</p>
              <p className="mt-0.5 text-muted">{explanation.explanation}</p>
              <p className="mt-1.5 font-medium">{explanation.question}</p>
              <p className="mt-1.5 text-[11px] text-subtle">Bu açıklama ders ekibinin hazırladığı kurallardan gelir, yapay zekâ üretimi değildir.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
