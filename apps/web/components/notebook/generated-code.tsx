"use client";

import { Copy, Link2, Link2Off, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { runEditableCode } from "@/lib/notebook/actions";
import type { EditableCode, LinregState, TrainingState } from "@/lib/notebook/types";
import { emptyExec } from "@/lib/notebook/types";
import { CodeEditor } from "./code-editor";
import { useNotebookStore, useRuntime } from "./context";
import { OutputView } from "./output-view";
import { RunBar } from "./run-bar";

/** Cell states that carry an editable copy of generated code. */
type WithCode = LinregState | TrainingState;

/**
 * Visual-to-code panel.
 *
 * - The generated code is a deterministic function of the visual state.
 * - "Düzenlenebilir kopya" forks it. While the copy is unedited it keeps
 *   following the visual controls. As soon as the student edits it, it is
 *   detached: visual changes never overwrite the student's code. Only the
 *   explicit "Üretilen koda dön" action replaces it.
 */
export function GeneratedCode({
  cellId,
  generated,
  code,
  allowEditable,
}: {
  cellId: string;
  generated: string;
  code: EditableCode;
  allowEditable: boolean;
}) {
  const store = useNotebookStore();
  const runtime = useRuntime();
  const [confirmReset, setConfirmReset] = useState(false);
  const patch = (fn: (c: EditableCode) => EditableCode) =>
    store.getState().update<WithCode>(cellId, (s) => ({ ...s, code: fn(s.code) }));

  const detached = code.forked && code.source !== code.base;

  // An unedited copy follows the generator.
  useEffect(() => {
    if (code.forked && !detached && code.base !== generated) {
      store.getState().update<WithCode>(cellId, (s) => ({ ...s, code: { ...s.code, source: generated, base: generated } }));
    }
  }, [cellId, code.forked, code.base, detached, generated, store]);

  if (!code.forked) {
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Link2 aria-hidden className="size-3.5" />
            Bu kod görsel kontrollerden üretiliyor ve onlarla birlikte güncelleniyor.
          </p>
          {allowEditable && (
            <Button
              variant="soft"
              size="sm"
              onClick={() => patch((c) => ({ ...c, ...emptyExec(), forked: true, source: generated, base: generated }))}
            >
              <Copy aria-hidden className="size-3.5" />
              Düzenlenebilir kopya oluştur
            </Button>
          )}
        </div>
        <pre
          className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-code-bg p-3 font-mono text-[13px] leading-5"
          data-testid="generated-code"
        >
          {generated}
        </pre>
      </div>
    );
  }

  return (
    <div>
      {detached ? (
        <Callout tone="warning" title="Bu kod artık senin" className="mb-3">
          <p>Kodu değiştirdin. Görsel kontroller bu kodu artık değiştirmez; yaptığın değişiklikler korunur.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {confirmReset ? (
              <>
                <span className="text-sm font-medium">Değişikliklerin silinecek. Emin misin?</span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    patch((c) => ({ ...c, source: generated, base: generated }));
                    setConfirmReset(false);
                  }}
                >
                  Evet, üretilen koda dön
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                  Vazgeç
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                <RotateCcw aria-hidden className="size-3.5" />
                Üretilen koda dön
              </Button>
            )}
          </div>
        </Callout>
      ) : (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
          <Link2 aria-hidden className="size-3.5" />
          Kopyayı henüz değiştirmedin; görsel kontrollerle birlikte güncelleniyor. İlk değişikliğinden sonra bağımsız olur.
        </p>
      )}
      <CodeEditor
        value={code.source}
        onChange={(source) => patch((c) => ({ ...c, source }))}
        onRun={() => code.status !== "running" && void runEditableCode(store, runtime, cellId)}
        label="Düzenlenebilir Python kopyası"
        errorLine={code.error?.line ?? null}
      />
      <RunBar exec={code} onRun={() => void runEditableCode(store, runtime, cellId)}>
        {!detached && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patch((c) => ({ ...c, ...emptyExec(), forked: false, source: "", base: "" }))}
            title="Kopyayı kapatır ve görsel koda döner"
          >
            <Link2Off aria-hidden className="size-3.5" />
            Kopyayı kapat
          </Button>
        )}
      </RunBar>
      <OutputView exec={code} code={code.source} />
    </div>
  );
}
